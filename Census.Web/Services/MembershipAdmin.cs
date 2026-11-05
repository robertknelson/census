using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using Census.Web.CommandQuery;
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
    private readonly JsonQueryHandler _queries;
    private readonly JsonCommandHandler _commands;

    public MembershipAdmin(JsonQueryHandler queries, JsonCommandHandler commands)
    {
        _queries = queries;
        _commands = commands;
    }

    public bool Enabled => _queries.Enabled;

    public Task<List<Dictionary<string, object>>> ApplicationsAsync() => Read("membership.admin-applications");

    public Task<List<Dictionary<string, object>>> MembersAsync() => Read("membership.members");

    public Task<List<Dictionary<string, object>>> ListsAsync() => Read("membership.admin-lists");

    public Task<List<Dictionary<string, object>>> AppPartsAsync() => Read("membership.admin-app-parts");

    public Task<List<Dictionary<string, object>>> RecentAuditAsync() => Read("membership.admin-audit-recent");

    public Task<List<Dictionary<string, object>>> AuditAsync(string entity, int id) =>
        Read("membership.admin-audit", ("Entity", entity), ("Id", id));

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
        Write("membership.application-save", actor,
            ("Id", (object)id ?? DBNull.Value),
            ("Identifier", r.Identifier.Trim()),
            ("Name", r.Name.Trim()),
            ("Tags", (r.Tags ?? "").Trim()),
            ("Disposition", r.Disposition.Trim()),
            ("ApplicationTypeId", r.ApplicationTypeId),
            ("Settings", string.IsNullOrWhiteSpace(r.Settings) ? "{ \"settings\":null}" : r.Settings));

    public Task<WriteResult> SaveMemberAsync(int? id, MemberSave r, Actor actor) =>
        Write("membership.member-save", actor,
            ("Id", (object)id ?? DBNull.Value),
            ("Identifier", r.Identifier.Trim()),
            ("WindowsIdentity", r.WindowsIdentity.Trim()),
            ("FirstName", r.FirstName.Trim()),
            ("LastName", r.LastName.Trim()),
            ("Email", (r.Email ?? "").Trim()));

    public Task<WriteResult> SaveGrantAsync(GrantSave r, bool revoke, Actor actor) =>
        Write("membership.grant-save", actor,
            ("MemberId", r.MemberId),
            ("ApplicationId", r.ApplicationId),
            ("RoleId", r.RoleId),
            ("Revoke", revoke));

    public Task<WriteResult> DeleteApplicationAsync(int id, Actor actor) =>
        Write("membership.application-delete", actor, ("Id", id));

    public Task<WriteResult> DeleteMemberAsync(int id, Actor actor) =>
        Write("membership.member-delete", actor, ("Id", id));

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

    public Task<WriteResult> SavePartAsync(AppPartSave r, Actor actor) => Write("membership.app-part-save", actor,
        ("Part", r.Part), ("ApplicationId", r.ApplicationId), ("OldKey", (object)r.OldKey),
        ("RoleId", r.RoleId), ("Alias", string.IsNullOrWhiteSpace(r.Alias) ? null : r.Alias.Trim()),
        ("StageId", r.StageId), ("Name", (r.Name ?? "").Trim()),
        ("ServiceTypeId", r.ServiceTypeId),
        ("StartOn", DateOnly.TryParse(r.StartOn, out var d) ? d.ToDateTime(TimeOnly.MinValue) : null),
        ("Status", (r.Status ?? "").Trim()));

    public Task<WriteResult> DeletePartAsync(AppPartSave r, Actor actor) => Write("membership.app-part-delete", actor,
        ("Part", r.Part), ("ApplicationId", r.ApplicationId), ("PartKey", (object)r.OldKey ?? 0));

    private async Task<List<Dictionary<string, object>>> Read(string key, params (string Name, object Value)[] values) =>
        (await _queries.QueryAsync(ResponseExtensions.Key(key, values))).Rows();

    private async Task<WriteResult> Write(string key, Actor actor, params (string Name, object Value)[] values) =>
        (await _commands.ExecuteAsync(ResponseExtensions.Key(key, values).By(actor), null)).ToWriteResult();

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

