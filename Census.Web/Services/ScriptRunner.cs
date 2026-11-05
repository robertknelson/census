using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Threading.Tasks;
using Census.Web.Identity;
using Microsoft.Data.SqlClient;

namespace Census.Web.Services;

// Runs one AppTrak script file with parameters (the membership page and the curate pages): reads
// come back as column → value rows; a write returns its first value, or the refusal the script
// THROWs with its own words: 50400 → 400, 50404 → 404, 50409 and 50410 (the record's state forbids
// it) → 409.
public class ScriptRunner(string sqlPath, string connectionString)
{
    public bool Enabled => !string.IsNullOrWhiteSpace(connectionString);

    public async Task<List<Dictionary<string, object>>> ReadAsync(string file, params (string Name, object Value, SqlDbType Type)[] parameters)
    {
        await using var connection = new SqlConnection(connectionString);
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

    // Every write names its actor: the effective user as @Actor, and the real one as @ImpersonatedBy while a system
    // administrator acts as someone else (census-on-apptrak.md §10.3), NULL otherwise. Scripts that audit use both.
    public async Task<WriteResult> WriteAsync(string file, Actor actor, params (string Name, object Value, SqlDbType Type)[] parameters)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        var all = new List<(string, object, SqlDbType)>(parameters) { ("Actor", actor.Identifier, SqlDbType.NVarChar), ("ImpersonatedBy", actor.ImpersonatedBy, SqlDbType.NVarChar) };
        await using var command = Command(connection, file, all.ToArray());
        try
        {
            return new WriteResult { Status = 200, Key = (await command.ExecuteScalarAsync())?.ToString() };
        }
        catch (SqlException e) when (e.Number is 50400 or 50404 or 50409 or 50410)
        {
            return new WriteResult { Status = e.Number == 50410 ? 409 : e.Number - 50000, Message = e.Message };
        }
    }

    private SqlCommand Command(SqlConnection connection, string file, (string Name, object Value, SqlDbType Type)[] parameters)
    {
        var command = new SqlCommand(File.ReadAllText(Path.Combine(sqlPath, file)), connection);
        foreach (var (name, value, type) in parameters) command.Parameters.Add(new SqlParameter("@" + name, type) { Value = value ?? DBNull.Value });
        return command;
    }
}

public class WriteResult
{
    public int Status { get; init; }
    public string Key { get; init; }
    public string Message { get; init; }
}
