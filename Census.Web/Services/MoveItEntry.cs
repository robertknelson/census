using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.CommandQuery;
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
    private readonly JsonQueryHandler _queries;
    private readonly JsonCommandHandler _commands;
    private readonly string _by;

    public MoveItEntry(JsonQueryHandler queries, JsonCommandHandler commands, IOptions<MoveItOptions> options)
    {
        _queries = queries;
        _commands = commands;
        _by = string.IsNullOrWhiteSpace(options.Value.By) ? "census-board" : options.Value.By;
    }

    public bool Enabled => _queries.Enabled;

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

        return await _commands.TransactionAsync(async tx =>
        {
            var release = await RunAsync(tx, "release-upsert",
                ("ApplicationId", request.ApplicationId),
                ("Name", request.Release.Name.Trim()),
                ("Kind", request.Release.Kind),
                ("TargetDate", request.Release.TargetDate == null ? null : DateOnly.Parse(request.Release.TargetDate).ToDateTime(TimeOnly.MinValue)),
                ("Note", Text(request.Release.Note)),
                ("By", _by));
            result.ReleaseId = (int)release["Id"];
            result.Release = (string)release["Outcome"];

            if (build != null)
            {
                var attributed = await RunAsync(tx, "build-upsert",
                    ("ReleaseId", result.ReleaseId),
                    ("Build", build),
                    ("Note", (string)null),
                    ("By", _by));
                result.Build = (string)attributed["Outcome"];
            }

            foreach (var item in request.Items ?? [])
            {
                var row = await RunAsync(tx, "workitem-upsert",
                    ("ApplicationId", request.ApplicationId),
                    ("ReleaseId", result.ReleaseId),
                    ("Kind", item.Kind),
                    ("Title", item.Title.Trim()),
                    ("Description", null),
                    ("BuiltBy", Text(item.BuiltBy)),
                    ("ExternalRef", Text(item.ExternalRef)),
                    ("IncludedInBuild", item.InThisBuild ? build : null),
                    ("FoundInStage", Text(item.FoundInStage)),
                    ("RemovedAt", null),
                    ("RemovedNote", null),
                    ("By", _by));
                result.Items[(string)row["Outcome"]]++;
            }

            // Notebook items picked into this release (§20); with a build in context they are
            // also attached, since naming the build is the moment the heard thing became real.
            foreach (var id in request.Schedule ?? [])
            {
                var row = await RunAsync(tx, "workitem-schedule",
                    ("Id", id),
                    ("ApplicationId", request.ApplicationId),
                    ("ReleaseId", result.ReleaseId));
                if ((string)row["Outcome"] == "scheduled") result.Scheduled++;
            }

            foreach (var id in (request.Attach ?? []).Concat(build == null ? [] : request.Schedule ?? []))
            {
                var row = await RunAsync(tx, "workitem-attach",
                    ("Id", id),
                    ("ReleaseId", result.ReleaseId),
                    ("Build", build));
                if ((string)row["Outcome"] == "attached") result.Attached++;
            }

            return result;
        });
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
        return await RunAsync(null, "workitem-add",
            ("ApplicationId", request.ApplicationId),
            ("Kind", request.Kind),
            ("Title", request.Title.Trim()),
            ("Description", Text(request.Note)),
            ("By", _by));
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
        var row = await RunAsync(null, "event-insert",
            ("ReleaseId", request.ReleaseId),
            ("Kind", request.Kind),
            ("Stage", Text(request.Stage)),
            ("Build", Text(request.Build)),
            ("At", DateTimeOffset.Parse(request.At)),
            ("EventBy", request.By.Trim()),
            ("Note", Text(request.Note)),
            ("By", _by));
        return (string)row["Outcome"];
    }

    public async Task<string> PullItemAsync(ItemRequest request)
    {
        var row = await RunAsync(null, "workitem-pull",
            ("Id", request.WorkItemId),
            ("Note", Text(request.Note)));
        return (string)row["Outcome"];
    }

    public async Task<string> RetitleAsync(ItemRequest request)
    {
        var row = await RunAsync(null, "workitem-retitle",
            ("Id", request.WorkItemId),
            ("Title", request.Title.Trim()));
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
        var row = await RunAsync(null, "build-upsert",
            ("ReleaseId", request.ReleaseId),
            ("Build", request.Build.Trim()),
            ("Note", Text(request.Note)),
            ("By", _by));
        return (string)row["Outcome"];
    }

    public async Task<string> ReleaseBuildAsync(BuildClaimRequest request)
    {
        return await _commands.TransactionAsync(tx => ReleaseClaimAsync(tx, request.ReleaseId, request.Build.Trim(), request.By.Trim(), Text(request.Note)));
    }

    public async Task<string> MoveBuildAsync(BuildClaimRequest request)
    {
        var build = request.Build.Trim();
        return await _commands.TransactionAsync(async tx =>
        {
            var released = await ReleaseClaimAsync(tx, request.ReleaseId, build, request.By.Trim(),
                Text(request.Note) ?? $"moved to release {request.ToReleaseId}");
            var claimed = await RunAsync(tx, "build-upsert",
                ("ReleaseId", request.ToReleaseId),
                ("Build", build),
                ("Note", (string)null),
                ("By", _by));
            return $"{released}, {(string)claimed["Outcome"]} on the other";
        });
    }

    private async Task<string> ReleaseClaimAsync(ICommandBatch tx, int releaseId, string build, string by, string note)
    {
        var row = await RunAsync(tx, "build-release",
            ("ReleaseId", releaseId),
            ("Build", build));
        var outcome = (string)row["Outcome"];
        if (outcome != "released") return outcome;
        await RunAsync(tx, "event-insert",
            ("ReleaseId", releaseId),
            ("Kind", "build-released"),
            ("Stage", (string)null),
            ("Build", build),
            ("At", DateTimeOffset.Now),
            ("EventBy", by),
            ("Note", note),
            ("By", _by));
        return outcome;
    }

    // Stabilization only (move-it.md §16): the release and everything asserted under it, in one transaction.
    public async Task<Dictionary<string, object>> DeleteReleaseAsync(int releaseId)
    {
        return await _commands.TransactionAsync(tx => RunAsync(tx, "release-delete", ("Id", releaseId)));
    }

    private async Task<Dictionary<string, string[]>> ListsAsync()
    {
        var rows = (await _queries.QueryAsync(ResponseExtensions.Key("moveit.lists"))).Rows();
        return rows.GroupBy(r => (string)r["List"]).ToDictionary(g => g.Key, g => g.Select(r => (string)r["Member"]).ToArray());
    }

    // One entry key's first row, inside a transaction when one is given (census-on-apptrak.md §3).
    private async Task<Dictionary<string, object>> RunAsync(ICommandBatch tx, string name, params (string Name, object Value)[] values)
    {
        var parameters = ResponseExtensions.Key($"entry.{name}", values);
        var response = tx != null ? await tx.ExecuteAsync(parameters) : await _commands.ExecuteAsync(parameters, null);
        return response.Rows()[0];
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
