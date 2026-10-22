using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
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

    public Task<WriteResult> SaveApplicationAsync(int? id, ApplicationSave r, string actor) =>
        _scripts.WriteAsync("application-save.sql", actor,
            ("Id", (object)id ?? DBNull.Value, SqlDbType.Int),
            ("Identifier", r.Identifier.Trim(), SqlDbType.NVarChar),
            ("Name", r.Name.Trim(), SqlDbType.NVarChar),
            ("Tags", (r.Tags ?? "").Trim(), SqlDbType.NVarChar),
            ("Disposition", r.Disposition.Trim(), SqlDbType.NVarChar),
            ("ApplicationTypeId", r.ApplicationTypeId, SqlDbType.Int),
            ("Settings", string.IsNullOrWhiteSpace(r.Settings) ? "{ \"settings\":null}" : r.Settings, SqlDbType.NVarChar));

    public Task<WriteResult> SaveMemberAsync(int? id, MemberSave r, string actor) =>
        _scripts.WriteAsync("member-save.sql", actor,
            ("Id", (object)id ?? DBNull.Value, SqlDbType.Int),
            ("Identifier", r.Identifier.Trim(), SqlDbType.NVarChar),
            ("WindowsIdentity", r.WindowsIdentity.Trim(), SqlDbType.NVarChar),
            ("FirstName", r.FirstName.Trim(), SqlDbType.NVarChar),
            ("LastName", r.LastName.Trim(), SqlDbType.NVarChar),
            ("Email", (r.Email ?? "").Trim(), SqlDbType.NVarChar));

    public Task<WriteResult> SaveGrantAsync(GrantSave r, bool revoke, string actor) =>
        _scripts.WriteAsync("grant-save.sql", actor,
            ("MemberId", r.MemberId, SqlDbType.Int),
            ("ApplicationId", r.ApplicationId, SqlDbType.Int),
            ("RoleId", r.RoleId, SqlDbType.Int),
            ("Revoke", revoke, SqlDbType.Bit));

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

public class GrantSave
{
    public int MemberId { get; set; }
    public int ApplicationId { get; set; }
    public int RoleId { get; set; }
}

