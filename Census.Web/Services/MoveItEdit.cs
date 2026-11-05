using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
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
    private readonly ScriptRunner _scripts;

    public MoveItEdit(IOptions<MoveItOptions> options, IWebHostEnvironment env)
    {
        _scripts = new ScriptRunner(Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.SqlPath)), options.Value.ConnectionString);
    }

    public bool Enabled => _scripts.Enabled;

    public static readonly string[] Reads = ["releases", "workitems", "builds", "events", "links", "audit-recent"];

    public Task<List<Dictionary<string, object>>> ReadAsync(string name) => _scripts.ReadAsync($"edit/{name}.sql");

    public Task<List<Dictionary<string, object>>> ReleaseAuditAsync(int releaseId) =>
        _scripts.ReadAsync("edit/audit.sql", ("ReleaseId", releaseId, SqlDbType.Int));

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

    public Task<WriteResult> SaveAsync(int? id, ReleaseEdit r, Actor actor) => _scripts.WriteAsync("edit/release-save.sql", actor,
        ("Id", (object)id, SqlDbType.Int), ("ApplicationId", r.ApplicationId, SqlDbType.Int), ("Name", r.Name.Trim(), SqlDbType.NVarChar),
        ("Kind", r.Kind, SqlDbType.NVarChar), ("TargetDate", DateOrNull(r.TargetDate), SqlDbType.Date), ("Note", Text(r.Note), SqlDbType.NVarChar));

    public Task<WriteResult> SaveAsync(int? id, WorkItemEdit r, Actor actor) => _scripts.WriteAsync("edit/workitem-save.sql", actor,
        ("Id", (object)id, SqlDbType.Int), ("ApplicationId", r.ApplicationId, SqlDbType.Int), ("ReleaseId", (object)r.ReleaseId, SqlDbType.Int),
        ("Kind", r.Kind, SqlDbType.NVarChar), ("Title", r.Title.Trim(), SqlDbType.NVarChar), ("Description", Text(r.Description), SqlDbType.NVarChar),
        ("BuiltBy", Text(r.BuiltBy), SqlDbType.NVarChar), ("ExternalRef", Text(r.ExternalRef), SqlDbType.NVarChar),
        ("IncludedInBuild", Text(r.IncludedInBuild), SqlDbType.NVarChar), ("FoundInStage", Text(r.FoundInStage), SqlDbType.NVarChar),
        ("RemovedAt", MomentOrNull(r.RemovedAt), SqlDbType.DateTimeOffset), ("RemovedNote", Text(r.RemovedNote), SqlDbType.NVarChar));

    public Task<WriteResult> SaveAsync(int? id, BuildEdit r, Actor actor) => _scripts.WriteAsync("edit/build-save.sql", actor,
        ("Id", (object)id, SqlDbType.Int), ("ReleaseId", r.ReleaseId, SqlDbType.Int), ("Build", r.Build.Trim(), SqlDbType.NVarChar), ("Note", Text(r.Note), SqlDbType.NVarChar));

    public Task<WriteResult> SaveAsync(int? id, EventEdit r, Actor actor) => _scripts.WriteAsync("edit/event-save.sql", actor,
        ("Id", (object)id, SqlDbType.Int), ("ReleaseId", r.ReleaseId, SqlDbType.Int), ("Kind", r.Kind, SqlDbType.NVarChar),
        ("Stage", Text(r.Stage), SqlDbType.NVarChar), ("Build", Text(r.Build), SqlDbType.NVarChar), ("At", MomentOrNull(r.At), SqlDbType.DateTimeOffset),
        ("EventBy", r.By.Trim(), SqlDbType.NVarChar), ("Note", Text(r.Note), SqlDbType.NVarChar));

    public Task<WriteResult> SaveAsync(int? id, LinkEdit r, Actor actor) => _scripts.WriteAsync("edit/link-save.sql", actor,
        ("Id", (object)id, SqlDbType.Int), ("WorkItemId", r.WorkItemId, SqlDbType.Int), ("LinkedWorkItemId", r.LinkedWorkItemId, SqlDbType.Int),
        ("Kind", r.Kind, SqlDbType.NVarChar), ("Note", Text(r.Note), SqlDbType.NVarChar));

    public Task<WriteResult> DeleteAsync(string entity, int id, Actor actor) => entity switch
    {
        "release" => _scripts.WriteAsync("edit/release-delete.sql", actor, ("Id", id, SqlDbType.Int)),
        "workitem" => _scripts.WriteAsync("edit/workitem-delete.sql", actor, ("Id", id, SqlDbType.Int)),
        _ => _scripts.WriteAsync("edit/row-delete.sql", actor, ("Entity", entity, SqlDbType.VarChar), ("Id", id, SqlDbType.Int)),
    };

    private async Task<ILookup<string, string>> ListsAsync() =>
        (await _scripts.ReadAsync("manifest/lists.sql")).ToLookup(r => (string)r["List"], r => (string)r["Member"], StringComparer.OrdinalIgnoreCase);

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
