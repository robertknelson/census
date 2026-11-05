using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using Census.Web.Identity;
using Census.Web.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

// The membership page (personas.md §6.2): reads and the three writes — save an application, save a
// member, grant or revoke a role. Each write is one script in apptrak/sql/membership, every value a
// parameter, run in its own transaction with its audit row. Validation here is the system
// boundary; uniqueness and existence are the scripts' (THROW 50404 / 50409).
public class MembershipAdmin
{
    private readonly ScriptRunner _scripts;

    public MembershipAdmin(IOptions<MoveItOptions> options, IWebHostEnvironment env)
    {
        _scripts = new ScriptRunner(Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.SqlPath, "membership")), options.Value.ConnectionString);
    }

    public bool Enabled => _scripts.Enabled;

    public Task<List<Dictionary<string, object>>> ApplicationsAsync() => _scripts.ReadAsync("admin-applications.sql");

    public Task<List<Dictionary<string, object>>> MembersAsync() => _scripts.ReadAsync("members.sql");

    public Task<List<Dictionary<string, object>>> ListsAsync() => _scripts.ReadAsync("admin-lists.sql");

    public Task<List<Dictionary<string, object>>> AppPartsAsync() => _scripts.ReadAsync("admin-app-parts.sql");

    public Task<List<Dictionary<string, object>>> RecentAuditAsync() => _scripts.ReadAsync("admin-audit-recent.sql");

    public Task<List<Dictionary<string, object>>> AuditAsync(string entity, int id) =>
        _scripts.ReadAsync("admin-audit.sql", ("Entity", entity, SqlDbType.VarChar), ("Id", id, SqlDbType.Int));

    public static List<string> Validate(ApplicationSave request)
    {
        var errors = new List<string>();
        Require(errors, request.Identifier, "Identifier", 50);
        Require(errors, request.Name, "Name", 100);
        Require(errors, request.Disposition, "Disposition", 30);
        if ((request.Tags ?? "").Length > 510) errors.Add("Tags can be at most 510 characters.");
        if (request.ApplicationTypeId <= 0) errors.Add("Pick an application type.");
        if (!string.IsNullOrWhiteSpace(request.Settings))
        {
            try { using var _ = JsonDocument.Parse(request.Settings); }
            catch (JsonException) { errors.Add("Settings must be JSON."); }
        }
        return errors;
    }

    public static List<string> Validate(MemberSave request)
    {
        var errors = new List<string>();
        Require(errors, request.Identifier, "Identifier", 100);
        Require(errors, request.WindowsIdentity, "Windows identity", 72);
        Require(errors, request.FirstName, "First name", 100);
        Require(errors, request.LastName, "Last name", 100);
        if ((request.Email ?? "").Length > 100) errors.Add("Email can be at most 100 characters.");
        return errors;
    }

    public Task<WriteResult> SaveApplicationAsync(int? id, ApplicationSave r, Actor actor) =>
        _scripts.WriteAsync("application-save.sql", actor,
            ("Id", (object)id ?? DBNull.Value, SqlDbType.Int),
            ("Identifier", r.Identifier.Trim(), SqlDbType.NVarChar),
            ("Name", r.Name.Trim(), SqlDbType.NVarChar),
            ("Tags", (r.Tags ?? "").Trim(), SqlDbType.NVarChar),
            ("Disposition", r.Disposition.Trim(), SqlDbType.NVarChar),
            ("ApplicationTypeId", r.ApplicationTypeId, SqlDbType.Int),
            ("Settings", string.IsNullOrWhiteSpace(r.Settings) ? "{ \"settings\":null}" : r.Settings, SqlDbType.NVarChar));

    public Task<WriteResult> SaveMemberAsync(int? id, MemberSave r, Actor actor) =>
        _scripts.WriteAsync("member-save.sql", actor,
            ("Id", (object)id ?? DBNull.Value, SqlDbType.Int),
            ("Identifier", r.Identifier.Trim(), SqlDbType.NVarChar),
            ("WindowsIdentity", r.WindowsIdentity.Trim(), SqlDbType.NVarChar),
            ("FirstName", r.FirstName.Trim(), SqlDbType.NVarChar),
            ("LastName", r.LastName.Trim(), SqlDbType.NVarChar),
            ("Email", (r.Email ?? "").Trim(), SqlDbType.NVarChar));

    public Task<WriteResult> SaveGrantAsync(GrantSave r, bool revoke, Actor actor) =>
        _scripts.WriteAsync("grant-save.sql", actor,
            ("MemberId", r.MemberId, SqlDbType.Int),
            ("ApplicationId", r.ApplicationId, SqlDbType.Int),
            ("RoleId", r.RoleId, SqlDbType.Int),
            ("Revoke", revoke, SqlDbType.Bit));

    public Task<WriteResult> DeleteApplicationAsync(int id, Actor actor) =>
        _scripts.WriteAsync("application-delete.sql", actor, ("Id", id, SqlDbType.Int));

    public Task<WriteResult> DeleteMemberAsync(int id, Actor actor) =>
        _scripts.WriteAsync("member-delete.sql", actor, ("Id", id, SqlDbType.Int));

    // An application's parts (personas.md §6.3, E-3): the roles it uses, its stages, its services.
    public static List<string> Validate(AppPartSave r)
    {
        var errors = new List<string>();
        if (r.ApplicationId <= 0) errors.Add("An application is required.");
        switch (r.Part)
        {
            case "role":
                if (r.RoleId <= 0) errors.Add("Pick a role.");
                if ((r.Alias ?? "").Trim().Length > 100) errors.Add("Alias can be at most 100 characters.");
                break;
            case "stage":
                if (r.StageId <= 0) errors.Add("Pick a stage.");
                Require(errors, r.Name, "Its name for the stage", 10);
                break;
            case "service":
                if (r.ServiceTypeId <= 0) errors.Add("Pick a service type.");
                if (!DateOnly.TryParse(r.StartOn, out _)) errors.Add("Start on must be a date (yyyy-MM-dd).");
                Require(errors, r.Status, "Status", 50);
                break;
            default:
                errors.Add("Part must be role, stage or service.");
                break;
        }
        return errors;
    }

    public Task<WriteResult> SavePartAsync(AppPartSave r, Actor actor) => _scripts.WriteAsync("app-part-save.sql", actor,
        ("Part", r.Part, SqlDbType.VarChar), ("ApplicationId", r.ApplicationId, SqlDbType.Int), ("OldKey", (object)r.OldKey, SqlDbType.Int),
        ("RoleId", r.RoleId, SqlDbType.Int), ("Alias", string.IsNullOrWhiteSpace(r.Alias) ? null : r.Alias.Trim(), SqlDbType.NVarChar),
        ("StageId", r.StageId, SqlDbType.Int), ("Name", (r.Name ?? "").Trim(), SqlDbType.NVarChar),
        ("ServiceTypeId", r.ServiceTypeId, SqlDbType.Int),
        ("StartOn", DateOnly.TryParse(r.StartOn, out var d) ? d.ToDateTime(TimeOnly.MinValue) : null, SqlDbType.Date),
        ("Status", (r.Status ?? "").Trim(), SqlDbType.NVarChar));

    public Task<WriteResult> DeletePartAsync(AppPartSave r, Actor actor) => _scripts.WriteAsync("app-part-delete.sql", actor,
        ("Part", r.Part, SqlDbType.VarChar), ("ApplicationId", r.ApplicationId, SqlDbType.Int), ("Key", (object)r.OldKey ?? 0, SqlDbType.Int));

    private static void Require(List<string> errors, string value, string label, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) errors.Add($"{label} is required.");
        else if (value.Trim().Length > max) errors.Add($"{label} can be at most {max} characters.");
    }
}

public class ApplicationSave
{
    public string Identifier { get; set; }
    public string Name { get; set; }
    public string Tags { get; set; }
    public string Disposition { get; set; }
    public int ApplicationTypeId { get; set; }
    public string Settings { get; set; }
}

public class MemberSave
{
    public string Identifier { get; set; }
    public string WindowsIdentity { get; set; }
    public string FirstName { get; set; }
    public string LastName { get; set; }
    public string Email { get; set; }
}

public class AppPartSave
{
    public string Part { get; set; }
    public int ApplicationId { get; set; }
    public int? OldKey { get; set; }
    public int RoleId { get; set; }
    public string Alias { get; set; }
    public int StageId { get; set; }
    public string Name { get; set; }
    public int ServiceTypeId { get; set; }
    public string StartOn { get; set; }
    public string Status { get; set; }
}

public class GrantSave
{
    public int MemberId { get; set; }
    public int ApplicationId { get; set; }
    public int RoleId { get; set; }
}

