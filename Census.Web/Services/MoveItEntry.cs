using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

// The board's one write (move-it.md §15): name what is in a build, or set up a release for
// work in progress. Runs the same statement files the manifest loader runs (apptrak/sql/manifest),
// with every value as a parameter, in one transaction. §14's rules hold; the one delete is
// DeleteReleaseAsync, kept for stabilization.
public class MoveItEntry
{
    private readonly string _sqlPath;
    private readonly string _connectionString;
    private readonly string _by;

    public MoveItEntry(IOptions<MoveItOptions> options, IWebHostEnvironment env)
    {
        _sqlPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.SqlPath, "manifest"));
        _connectionString = options.Value.ConnectionString;
        _by = string.IsNullOrWhiteSpace(options.Value.By) ? "census-board" : options.Value.By;
    }

    public bool Enabled => !string.IsNullOrWhiteSpace(_connectionString);

    public async Task<List<string>> ValidateAsync(NameBuildRequest request)
    {
        var errors = new List<string>();
        if (request.ApplicationId <= 0) errors.Add("An application is required.");
        if (request.Release == null || string.IsNullOrWhiteSpace(request.Release.Name)) errors.Add("The release needs a name.");
        if (request.Release?.TargetDate != null && !DateOnly.TryParse(request.Release.TargetDate, out _)) errors.Add("Target date must be yyyy-MM-dd.");

        var lists = await ListsAsync();
        bool In(string list, string value) => lists.TryGetValue(list, out var members) && members.Contains(value, StringComparer.OrdinalIgnoreCase);

        if (request.Release != null && !In("release-kinds", request.Release.Kind)) errors.Add($"Release kind '{request.Release.Kind}' is not in release-kinds.");
        foreach (var item in request.Items ?? [])
        {
            if (string.IsNullOrWhiteSpace(item.Title)) errors.Add("Every item needs a title.");
            if (!In("work-item-kinds", item.Kind)) errors.Add($"Item '{item.Title}': kind '{item.Kind}' is not in work-item-kinds.");
            if (!string.IsNullOrWhiteSpace(item.FoundInStage) && !In("stages", item.FoundInStage)) errors.Add($"Item '{item.Title}': stage '{item.FoundInStage}' is not in stages.");
        }
        if (string.IsNullOrWhiteSpace(request.Build) && (request.Attach?.Count ?? 0) > 0) errors.Add("Items can only be attached to a build.");
        return errors;
    }

    public async Task<NameBuildResult> NameBuildAsync(NameBuildRequest request)
    {
        var build = Text(request.Build);
        var result = new NameBuildResult();

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = connection.BeginTransaction();

        var release = await RunAsync(connection, tx, "release-upsert",
            ("ApplicationId", request.ApplicationId, SqlDbType.Int),
            ("Name", request.Release.Name.Trim(), SqlDbType.NVarChar),
            ("Kind", request.Release.Kind, SqlDbType.NVarChar),
            ("TargetDate", request.Release.TargetDate == null ? null : DateOnly.Parse(request.Release.TargetDate).ToDateTime(TimeOnly.MinValue), SqlDbType.Date),
            ("Note", Text(request.Release.Note), SqlDbType.NVarChar),
            ("By", _by, SqlDbType.NVarChar));
        result.ReleaseId = (int)release["Id"];
        result.Release = (string)release["Outcome"];

        if (build != null)
        {
            var attributed = await RunAsync(connection, tx, "build-upsert",
                ("ReleaseId", result.ReleaseId, SqlDbType.Int),
                ("Build", build, SqlDbType.NVarChar),
                ("Note", null, SqlDbType.NVarChar),
                ("By", _by, SqlDbType.NVarChar));
            result.Build = (string)attributed["Outcome"];
        }

        foreach (var item in request.Items ?? [])
        {
            var row = await RunAsync(connection, tx, "workitem-upsert",
                ("ApplicationId", request.ApplicationId, SqlDbType.Int),
                ("ReleaseId", result.ReleaseId, SqlDbType.Int),
                ("Kind", item.Kind, SqlDbType.NVarChar),
                ("Title", item.Title.Trim(), SqlDbType.NVarChar),
                ("Description", null, SqlDbType.NVarChar),
                ("BuiltBy", Text(item.BuiltBy), SqlDbType.NVarChar),
                ("ExternalRef", Text(item.ExternalRef), SqlDbType.NVarChar),
                ("IncludedInBuild", item.InThisBuild ? build : null, SqlDbType.NVarChar),
                ("FoundInStage", Text(item.FoundInStage), SqlDbType.NVarChar),
                ("RemovedAt", null, SqlDbType.DateTimeOffset),
                ("RemovedNote", null, SqlDbType.NVarChar),
                ("By", _by, SqlDbType.NVarChar));
            result.Items[(string)row["Outcome"]]++;
        }

        // Notebook items picked into this release (§20); with a build in context they are
        // also attached, since naming the build is the moment the heard thing became real.
        foreach (var id in request.Schedule ?? [])
        {
            var row = await RunAsync(connection, tx, "workitem-schedule",
                ("Id", id, SqlDbType.Int),
                ("ApplicationId", request.ApplicationId, SqlDbType.Int),
                ("ReleaseId", result.ReleaseId, SqlDbType.Int));
            if ((string)row["Outcome"] == "scheduled") result.Scheduled++;
        }

        foreach (var id in (request.Attach ?? []).Concat(build == null ? [] : request.Schedule ?? []))
        {
            var row = await RunAsync(connection, tx, "workitem-attach",
                ("Id", id, SqlDbType.Int),
                ("ReleaseId", result.ReleaseId, SqlDbType.Int),
                ("Build", build, SqlDbType.NVarChar));
            if ((string)row["Outcome"] == "attached") result.Attached++;
        }

        await tx.CommitAsync();
        return result;
    }

    // The notebook's entry (§20): a feature or fix heard about for an application, no release.
    public async Task<List<string>> ValidateAddItemAsync(AddItemRequest request)
    {
        var errors = new List<string>();
        if (request.ApplicationId <= 0) errors.Add("An application is required.");
        if (string.IsNullOrWhiteSpace(request.Title)) errors.Add("Say what is coming.");
        var lists = await ListsAsync();
        if (!(lists.TryGetValue("work-item-kinds", out var kinds) && kinds.Contains(request.Kind, StringComparer.OrdinalIgnoreCase)))
            errors.Add($"Kind '{request.Kind}' is not in work-item-kinds.");
        return errors;
    }

    public async Task<Dictionary<string, object>> AddItemAsync(AddItemRequest request)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        return await RunAsync(connection, null, "workitem-add",
            ("ApplicationId", request.ApplicationId, SqlDbType.Int),
            ("Kind", request.Kind, SqlDbType.NVarChar),
            ("Title", request.Title.Trim(), SqlDbType.NVarChar),
            ("Description", Text(request.Note), SqlDbType.NVarChar),
            ("By", _by, SqlDbType.NVarChar));
    }

    public async Task<List<string>> ValidateEventAsync(EventRequest request)
    {
        var errors = new List<string>();
        if (request.ReleaseId <= 0) errors.Add("A release is required.");
        if (string.IsNullOrWhiteSpace(request.By)) errors.Add("Say who did it.");
        if (!DateTimeOffset.TryParse(request.At, out _)) errors.Add("'at' must be a date-time.");
        var lists = await ListsAsync();
        bool In(string list, string value) => lists.TryGetValue(list, out var members) && members.Contains(value, StringComparer.OrdinalIgnoreCase);
        if (!In("event-kinds", request.Kind)) errors.Add($"Event kind '{request.Kind}' is not in event-kinds.");
        if (!string.IsNullOrWhiteSpace(request.Stage) && !In("stages", request.Stage)) errors.Add($"Stage '{request.Stage}' is not in stages.");
        return errors;
    }

    // Events are history (§14): inserted if absent by (release, kind, stage, build, at), never updated.
    public async Task<string> RecordEventAsync(EventRequest request)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var row = await RunAsync(connection, null, "event-insert",
            ("ReleaseId", request.ReleaseId, SqlDbType.Int),
            ("Kind", request.Kind, SqlDbType.NVarChar),
            ("Stage", Text(request.Stage), SqlDbType.NVarChar),
            ("Build", Text(request.Build), SqlDbType.NVarChar),
            ("At", DateTimeOffset.Parse(request.At), SqlDbType.DateTimeOffset),
            ("EventBy", request.By.Trim(), SqlDbType.NVarChar),
            ("Note", Text(request.Note), SqlDbType.NVarChar),
            ("By", _by, SqlDbType.NVarChar));
        return (string)row["Outcome"];
    }

    public async Task<string> PullItemAsync(ItemRequest request)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var row = await RunAsync(connection, null, "workitem-pull",
            ("Id", request.WorkItemId, SqlDbType.Int),
            ("Note", Text(request.Note), SqlDbType.NVarChar));
        return (string)row["Outcome"];
    }

    public async Task<string> RetitleAsync(ItemRequest request)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var row = await RunAsync(connection, null, "workitem-retitle",
            ("Id", request.WorkItemId, SqlDbType.Int),
            ("Title", request.Title.Trim(), SqlDbType.NVarChar));
        return (string)row["Outcome"];
    }

    // The release page's build claims (move-it.md §29): claim a seen build, release a claim with
    // the act on the record, or move a claim to another release of the same application.
    public List<string> ValidateBuildClaim(BuildClaimRequest request, bool needsBy, bool needsTo)
    {
        var errors = new List<string>();
        if (request.ReleaseId <= 0) errors.Add("A release is required.");
        if (string.IsNullOrWhiteSpace(request.Build)) errors.Add("A build is required.");
        if (needsBy && string.IsNullOrWhiteSpace(request.By)) errors.Add("Say who did it.");
        if (needsTo && (request.ToReleaseId <= 0 || request.ToReleaseId == request.ReleaseId)) errors.Add("Pick another release to move it to.");
        return errors;
    }

    public async Task<string> ClaimBuildAsync(BuildClaimRequest request)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var row = await RunAsync(connection, null, "build-upsert",
            ("ReleaseId", request.ReleaseId, SqlDbType.Int),
            ("Build", request.Build.Trim(), SqlDbType.NVarChar),
            ("Note", Text(request.Note), SqlDbType.NVarChar),
            ("By", _by, SqlDbType.NVarChar));
        return (string)row["Outcome"];
    }

    public async Task<string> ReleaseBuildAsync(BuildClaimRequest request)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = connection.BeginTransaction();
        var outcome = await ReleaseClaimAsync(connection, tx, request.ReleaseId, request.Build.Trim(), request.By.Trim(), Text(request.Note));
        await tx.CommitAsync();
        return outcome;
    }

    public async Task<string> MoveBuildAsync(BuildClaimRequest request)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = connection.BeginTransaction();
        var build = request.Build.Trim();
        var released = await ReleaseClaimAsync(connection, tx, request.ReleaseId, build, request.By.Trim(),
            Text(request.Note) ?? $"moved to release {request.ToReleaseId}");
        var claimed = await RunAsync(connection, tx, "build-upsert",
            ("ReleaseId", request.ToReleaseId, SqlDbType.Int),
            ("Build", build, SqlDbType.NVarChar),
            ("Note", (string)null, SqlDbType.NVarChar),
            ("By", _by, SqlDbType.NVarChar));
        await tx.CommitAsync();
        return $"{released}, {(string)claimed["Outcome"]} on the other";
    }

    private async Task<string> ReleaseClaimAsync(SqlConnection connection, SqlTransaction tx, int releaseId, string build, string by, string note)
    {
        var row = await RunAsync(connection, tx, "build-release",
            ("ReleaseId", releaseId, SqlDbType.Int),
            ("Build", build, SqlDbType.NVarChar));
        var outcome = (string)row["Outcome"];
        if (outcome != "released") return outcome;
        await RunAsync(connection, tx, "event-insert",
            ("ReleaseId", releaseId, SqlDbType.Int),
            ("Kind", "build-released", SqlDbType.NVarChar),
            ("Stage", (string)null, SqlDbType.NVarChar),
            ("Build", build, SqlDbType.NVarChar),
            ("At", DateTimeOffset.Now, SqlDbType.DateTimeOffset),
            ("EventBy", by, SqlDbType.NVarChar),
            ("Note", note, SqlDbType.NVarChar),
            ("By", _by, SqlDbType.NVarChar));
        return outcome;
    }

    // Stabilization only (move-it.md §16): the release and everything asserted under it, in one transaction.
    public async Task<Dictionary<string, object>> DeleteReleaseAsync(int releaseId)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = connection.BeginTransaction();
        var row = await RunAsync(connection, tx, "release-delete", ("Id", releaseId, SqlDbType.Int));
        await tx.CommitAsync();
        return row;
    }

    private async Task<Dictionary<string, string[]>> ListsAsync()
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var rows = await ReadAsync(connection, null, "lists");
        return rows.GroupBy(r => (string)r["List"]).ToDictionary(g => g.Key, g => g.Select(r => (string)r["Member"]).ToArray());
    }

    private async Task<Dictionary<string, object>> RunAsync(SqlConnection connection, SqlTransaction tx, string file, params (string Name, object Value, SqlDbType Type)[] parameters)
    {
        var rows = await ReadAsync(connection, tx, file, parameters);
        return rows[0];
    }

    private async Task<List<Dictionary<string, object>>> ReadAsync(SqlConnection connection, SqlTransaction tx, string file, params (string Name, object Value, SqlDbType Type)[] parameters)
    {
        var sql = await File.ReadAllTextAsync(Path.Combine(_sqlPath, file + ".sql"));
        await using var command = new SqlCommand(sql, connection, tx);
        foreach (var (name, value, type) in parameters)
        {
            var p = command.Parameters.Add("@" + name, type);
            if (type == SqlDbType.NVarChar) p.Size = -1;
            p.Value = value ?? DBNull.Value;
        }
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<Dictionary<string, object>>();
        while (await reader.ReadAsync())
        {
            var row = new Dictionary<string, object>(reader.FieldCount);
            for (var i = 0; i < reader.FieldCount; i++)
            {
                row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            }
            rows.Add(row);
        }
        return rows;
    }

    private static string Text(string value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public class NameBuildRequest
{
    public int ApplicationId { get; set; }
    public string Build { get; set; }
    public ReleaseSpec Release { get; set; }
    public List<NewItem> Items { get; set; }
    public List<int> Attach { get; set; }
    public List<int> Schedule { get; set; }
}

public class AddItemRequest
{
    public int ApplicationId { get; set; }
    public string Kind { get; set; }
    public string Title { get; set; }
    public string Note { get; set; }
}

public class ReleaseSpec
{
    public string Name { get; set; }
    public string Kind { get; set; }
    public string TargetDate { get; set; }
    public string Note { get; set; }
}

public class NewItem
{
    public string Kind { get; set; }
    public string Title { get; set; }
    public string BuiltBy { get; set; }
    public string ExternalRef { get; set; }
    public string FoundInStage { get; set; }
    public bool InThisBuild { get; set; }
}

public class EventRequest
{
    public int ReleaseId { get; set; }
    public string Kind { get; set; }
    public string Stage { get; set; }
    public string Build { get; set; }
    public string At { get; set; }
    public string By { get; set; }
    public string Note { get; set; }
}

public class ItemRequest
{
    public int WorkItemId { get; set; }
    public string Note { get; set; }
    public string Title { get; set; }
}

public class ReleaseRequest
{
    public int ReleaseId { get; set; }
}

public class BuildClaimRequest
{
    public int ReleaseId { get; set; }
    public int ToReleaseId { get; set; }
    public string Build { get; set; }
    public string By { get; set; }
    public string Note { get; set; }
}

public class NameBuildResult
{
    public int ReleaseId { get; set; }
    public string Release { get; set; }
    public string Build { get; set; }
    public Dictionary<string, int> Items { get; } = new() { ["inserted"] = 0, ["updated"] = 0, ["unchanged"] = 0 };
    public int Attached { get; set; }
    public int Scheduled { get; set; }
}
