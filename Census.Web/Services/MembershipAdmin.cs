using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using Census.Web.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

// The membership page (personas.md §6.2): reads and the three writes — save an application, save a
// member, grant or revoke a role. Each write is one script in apptrak/sql/membership, every value a
// parameter, run in its own transaction with its audit row. Validation here is the system
// boundary; uniqueness and existence are the scripts' (THROW 50404 / 50409).
public class MembershipAdmin
{
    private readonly string _sqlPath;
    private readonly string _connectionString;

    public MembershipAdmin(IOptions<MoveItOptions> options, IWebHostEnvironment env)
    {
        _sqlPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.SqlPath, "membership"));
        _connectionString = options.Value.ConnectionString;
    }

    public bool Enabled => !string.IsNullOrWhiteSpace(_connectionString);

    public Task<List<Dictionary<string, object>>> ApplicationsAsync() => ReadAsync("admin-applications.sql");

    public Task<List<Dictionary<string, object>>> MembersAsync() => ReadAsync("members.sql");

    public Task<List<Dictionary<string, object>>> ListsAsync() => ReadAsync("admin-lists.sql");

    public Task<List<Dictionary<string, object>>> RecentAuditAsync() => ReadAsync("admin-audit-recent.sql");

    public Task<List<Dictionary<string, object>>> AuditAsync(string entity, int id) =>
        ReadAsync("admin-audit.sql", ("Entity", entity, SqlDbType.VarChar), ("Id", id, SqlDbType.Int));

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
        WriteAsync("application-save.sql", actor,
            ("Id", (object)id ?? DBNull.Value, SqlDbType.Int),
            ("Identifier", r.Identifier.Trim(), SqlDbType.NVarChar),
            ("Name", r.Name.Trim(), SqlDbType.NVarChar),
            ("Tags", (r.Tags ?? "").Trim(), SqlDbType.NVarChar),
            ("Disposition", r.Disposition.Trim(), SqlDbType.NVarChar),
            ("ApplicationTypeId", r.ApplicationTypeId, SqlDbType.Int),
            ("Settings", string.IsNullOrWhiteSpace(r.Settings) ? "{ \"settings\":null}" : r.Settings, SqlDbType.NVarChar));

    public Task<WriteResult> SaveMemberAsync(int? id, MemberSave r, string actor) =>
        WriteAsync("member-save.sql", actor,
            ("Id", (object)id ?? DBNull.Value, SqlDbType.Int),
            ("Identifier", r.Identifier.Trim(), SqlDbType.NVarChar),
            ("WindowsIdentity", r.WindowsIdentity.Trim(), SqlDbType.NVarChar),
            ("FirstName", r.FirstName.Trim(), SqlDbType.NVarChar),
            ("LastName", r.LastName.Trim(), SqlDbType.NVarChar),
            ("Email", (r.Email ?? "").Trim(), SqlDbType.NVarChar));

    public Task<WriteResult> SaveGrantAsync(GrantSave r, bool revoke, string actor) =>
        WriteAsync("grant-save.sql", actor,
            ("MemberId", r.MemberId, SqlDbType.Int),
            ("ApplicationId", r.ApplicationId, SqlDbType.Int),
            ("RoleId", r.RoleId, SqlDbType.Int),
            ("Revoke", revoke, SqlDbType.Bit));

    private static void Require(List<string> errors, string value, string label, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) errors.Add($"{label} is required.");
        else if (value.Trim().Length > max) errors.Add($"{label} can be at most {max} characters.");
    }

    private async Task<List<Dictionary<string, object>>> ReadAsync(string file, params (string Name, object Value, SqlDbType Type)[] parameters)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = Command(connection, file, parameters);
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<Dictionary<string, object>>();
        while (await reader.ReadAsync())
        {
            var row = new Dictionary<string, object>(reader.FieldCount);
            for (var i = 0; i < reader.FieldCount; i++) row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            rows.Add(row);
        }
        return rows;
    }

    private async Task<WriteResult> WriteAsync(string file, string actor, params (string Name, object Value, SqlDbType Type)[] parameters)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        var all = new List<(string, object, SqlDbType)>(parameters) { ("Actor", actor, SqlDbType.NVarChar) };
        await using var command = Command(connection, file, all.ToArray());
        try
        {
            return new WriteResult { Status = 200, Key = (await command.ExecuteScalarAsync())?.ToString() };
        }
        catch (SqlException e) when (e.Number is 50404 or 50409)
        {
            return new WriteResult { Status = e.Number - 50000, Message = e.Message };
        }
    }

    private SqlCommand Command(SqlConnection connection, string file, (string Name, object Value, SqlDbType Type)[] parameters)
    {
        var command = new SqlCommand(File.ReadAllText(Path.Combine(_sqlPath, file)), connection);
        foreach (var (name, value, type) in parameters) command.Parameters.Add(new SqlParameter("@" + name, type) { Value = value ?? DBNull.Value });
        return command;
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

public class WriteResult
{
    public int Status { get; init; }
    public string Key { get; init; }
    public string Message { get; init; }
}
