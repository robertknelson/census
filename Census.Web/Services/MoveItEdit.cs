using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.CommandQuery;
using Census.Web.Identity;
using Census.Web.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

// The curate pages' corrections (personas.md §6.3): every asserted row in Move It — release, feature
// or fix, build claim, event, link — created, corrected or deleted, each write one script in
// apptrak/sql/edit with its audit row (moveit.EditAudit). Robert's ruling, 2026-10-22: "i need to be
// able to correct anything". Kinds and stages are checked against AppTrak's lists here; existence
// and uniqueness are the scripts'.
public class MoveItEdit
{
    private readonly JsonQueryHandler _queries;
    private readonly JsonCommandHandler _commands;

    public MoveItEdit(JsonQueryHandler queries, JsonCommandHandler commands)
    {
        _queries = queries;
        _commands = commands;
    }

    public bool Enabled => _queries.Enabled;

    public static readonly string[] Reads = ["releases", "workitems", "builds", "events", "links", "audit-recent"];

    public async Task<List<Dictionary<string, object>>> ReadAsync(string name) => (await _queries.QueryAsync(ResponseExtensions.Key($"edit.{name}"))).Rows();

    public async Task<List<Dictionary<string, object>>> ReleaseAuditAsync(int releaseId) =>
        (await _queries.QueryAsync(ResponseExtensions.Key("edit.audit", ("ReleaseId", releaseId)))).Rows();

    public async Task<List<string>> ValidateAsync(ReleaseEdit r)
    {
        var errors = new List<string>();
        var lists = await ListsAsync();
        if (r.ApplicationId <= 0) errors.Add("An application is required.");
        Require(errors, r.Name, "Name", 200);
        In(errors, lists, "release-kinds", r.Kind, "Kind", required: true);
        Date(errors, r.TargetDate, "Target date");
        return errors;
    }

    public async Task<List<string>> ValidateAsync(WorkItemEdit r)
    {
        var errors = new List<string>();
        var lists = await ListsAsync();
        if (r.ApplicationId <= 0) errors.Add("An application is required.");
        Require(errors, r.Title, "Title", 400);
        In(errors, lists, "work-item-kinds", r.Kind, "Kind", required: true);
        In(errors, lists, "stages", r.FoundInStage, "Found in stage", required: false);
        Max(errors, r.BuiltBy, "Built by", 100);
        Max(errors, r.ExternalRef, "External ref", 200);
        Max(errors, r.IncludedInBuild, "Build", 100);
        Max(errors, r.RemovedNote, "Removed note", 510);
        Moment(errors, r.RemovedAt, "Removed at", required: false);
        return errors;
    }

    public static List<string> Validate(BuildEdit r)
    {
        var errors = new List<string>();
        if (r.ReleaseId <= 0) errors.Add("A release is required.");
        Require(errors, r.Build, "Build", 100);
        Max(errors, r.Note, "Note", 510);
        return errors;
    }

    public async Task<List<string>> ValidateAsync(EventEdit r)
    {
        var errors = new List<string>();
        var lists = await ListsAsync();
        if (r.ReleaseId <= 0) errors.Add("A release is required.");
        In(errors, lists, "event-kinds", r.Kind, "Kind", required: true);
        In(errors, lists, "stages", r.Stage, "Stage", required: false);
        Max(errors, r.Build, "Build", 100);
        Moment(errors, r.At, "When", required: true);
        Require(errors, r.By, "By whom", 100);
        return errors;
    }

    public async Task<List<string>> ValidateAsync(LinkEdit r)
    {
        var errors = new List<string>();
        var lists = await ListsAsync();
        if (r.WorkItemId <= 0 || r.LinkedWorkItemId <= 0) errors.Add("Both items are required.");
        In(errors, lists, "link-kinds", r.Kind, "Kind", required: true);
        Max(errors, r.Note, "Note", 510);
        return errors;
    }

    public Task<WriteResult> SaveAsync(int? id, ReleaseEdit r, Actor actor) => Write("edit.release-save", actor,
        ("Id", (object)id), ("ApplicationId", r.ApplicationId), ("Name", r.Name.Trim()),
        ("Kind", r.Kind), ("TargetDate", DateOrNull(r.TargetDate)), ("Note", Text(r.Note)));

    public Task<WriteResult> SaveAsync(int? id, WorkItemEdit r, Actor actor) => Write("edit.workitem-save", actor,
        ("Id", (object)id), ("ApplicationId", r.ApplicationId), ("ReleaseId", (object)r.ReleaseId),
        ("Kind", r.Kind), ("Title", r.Title.Trim()), ("Description", Text(r.Description)),
        ("BuiltBy", Text(r.BuiltBy)), ("ExternalRef", Text(r.ExternalRef)),
        ("IncludedInBuild", Text(r.IncludedInBuild)), ("FoundInStage", Text(r.FoundInStage)),
        ("RemovedAt", MomentOrNull(r.RemovedAt)), ("RemovedNote", Text(r.RemovedNote)));

    public Task<WriteResult> SaveAsync(int? id, BuildEdit r, Actor actor) => Write("edit.build-save", actor,
        ("Id", (object)id), ("ReleaseId", r.ReleaseId), ("Build", r.Build.Trim()), ("Note", Text(r.Note)));

    public Task<WriteResult> SaveAsync(int? id, EventEdit r, Actor actor) => Write("edit.event-save", actor,
        ("Id", (object)id), ("ReleaseId", r.ReleaseId), ("Kind", r.Kind),
        ("Stage", Text(r.Stage)), ("Build", Text(r.Build)), ("At", MomentOrNull(r.At)),
        ("EventBy", r.By.Trim()), ("Note", Text(r.Note)));

    public Task<WriteResult> SaveAsync(int? id, LinkEdit r, Actor actor) => Write("edit.link-save", actor,
        ("Id", (object)id), ("WorkItemId", r.WorkItemId), ("LinkedWorkItemId", r.LinkedWorkItemId),
        ("Kind", r.Kind), ("Note", Text(r.Note)));

    public Task<WriteResult> DeleteAsync(string entity, int id, Actor actor) => entity switch
    {
        "release" => Write("edit.release-delete", actor, ("Id", id)),
        "workitem" => Write("edit.workitem-delete", actor, ("Id", id)),
        _ => Write("edit.row-delete", actor, ("Entity", entity), ("Id", id)),
    };

    private async Task<WriteResult> Write(string key, Actor actor, params (string Name, object Value)[] values) =>
        (await _commands.ExecuteAsync(ResponseExtensions.Key(key, values).By(actor), null)).ToWriteResult();

    private async Task<ILookup<string, string>> ListsAsync() =>
        (await _queries.QueryAsync(ResponseExtensions.Key("moveit.lists"))).Rows().ToLookup(r => (string)r["List"], r => (string)r["Member"], StringComparer.OrdinalIgnoreCase);

    private static void In(List<string> errors, ILookup<string, string> lists, string list, string value, string label, bool required)
    {
        if (string.IsNullOrWhiteSpace(value)) { if (required) errors.Add($"{label} is required."); return; }
        if (!lists[list].Contains(value, StringComparer.OrdinalIgnoreCase)) errors.Add($"{label} '{value}' is not in {list}.");
    }

    private static void Require(List<string> errors, string value, string label, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) errors.Add($"{label} is required.");
        else Max(errors, value, label, max);
    }

    private static void Max(List<string> errors, string value, string label, int max)
    {
        if ((value ?? "").Trim().Length > max) errors.Add($"{label} can be at most {max} characters.");
    }

    private static void Date(List<string> errors, string value, string label)
    {
        if (!string.IsNullOrWhiteSpace(value) && !DateOnly.TryParse(value, out _)) errors.Add($"{label} must be a date (yyyy-MM-dd).");
    }

    private static void Moment(List<string> errors, string value, string label, bool required)
    {
        if (string.IsNullOrWhiteSpace(value)) { if (required) errors.Add($"{label} is required."); return; }
        if (!DateTimeOffset.TryParse(value, out _)) errors.Add($"{label} must be a date and time.");
    }

    private static object Text(string value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static object DateOrNull(string value) => string.IsNullOrWhiteSpace(value) ? null : DateOnly.Parse(value).ToDateTime(TimeOnly.MinValue);
    private static object MomentOrNull(string value) => string.IsNullOrWhiteSpace(value) ? null : DateTimeOffset.Parse(value);
}

public class ReleaseEdit
{
    public int ApplicationId { get; set; }
    public string Name { get; set; }
    public string Kind { get; set; }
    public string TargetDate { get; set; }
    public string Note { get; set; }
}

public class WorkItemEdit
{
    public int ApplicationId { get; set; }
    public int? ReleaseId { get; set; }
    public string Kind { get; set; }
    public string Title { get; set; }
    public string Description { get; set; }
    public string BuiltBy { get; set; }
    public string ExternalRef { get; set; }
    public string IncludedInBuild { get; set; }
    public string FoundInStage { get; set; }
    public string RemovedAt { get; set; }
    public string RemovedNote { get; set; }
}

public class BuildEdit
{
    public int ReleaseId { get; set; }
    public string Build { get; set; }
    public string Note { get; set; }
}

public class EventEdit
{
    public int ReleaseId { get; set; }
    public string Kind { get; set; }
    public string Stage { get; set; }
    public string Build { get; set; }
    public string At { get; set; }
    public string By { get; set; }
    public string Note { get; set; }
}

public class LinkEdit
{
    public int WorkItemId { get; set; }
    public int LinkedWorkItemId { get; set; }
    public string Kind { get; set; }
    public string Note { get; set; }
}
