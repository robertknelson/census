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
// with every value as a parameter, in one transaction. Never deletes; §14's rules hold.
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

        foreach (var id in request.Attach ?? [])
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

public class NameBuildResult
{
    public int ReleaseId { get; set; }
    public string Release { get; set; }
    public string Build { get; set; }
    public Dictionary<string, int> Items { get; } = new() { ["inserted"] = 0, ["updated"] = 0, ["unchanged"] = 0 };
    public int Attached { get; set; }
}
