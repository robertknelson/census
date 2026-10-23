using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Threading.Tasks;
using Census.Web.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

// Trace's reads (log-explorer-and-trace.md §5): the identifiers in a window, one identifier's month
// and day, one session's timeline, through apptrak/sql/logs. The identifier is the person (R2). The
// day, month and session scripts answer with one JSON document, passed through as it is.
public class TraceReader
{
    // Setting: the most requests one session's timeline reads; the newest are kept.
    public const int SessionLimit = 3000;

    private readonly ScriptRunner _scripts;
    private readonly string _schema;

    public TraceReader(IOptions<LogsOptions> logs, IOptions<MoveItOptions> moveIt, IWebHostEnvironment env)
    {
        var connection = string.IsNullOrWhiteSpace(logs.Value.ConnectionString) ? moveIt.Value.ConnectionString : logs.Value.ConnectionString;
        _schema = logs.Value.Schema;
        _scripts = new ScriptRunner(Path.GetFullPath(Path.Combine(env.ContentRootPath, moveIt.Value.SqlPath, "logs")), connection);
    }

    public bool Enabled => _scripts.Enabled;

    public Task<List<Dictionary<string, object>>> PeopleAsync(DateTimeOffset from, DateTimeOffset to) =>
        _scripts.ReadAsync("trace-people.sql",
            ("Schema", _schema, SqlDbType.NVarChar),
            ("From", from, SqlDbType.DateTimeOffset),
            ("To", to, SqlDbType.DateTimeOffset));

    public Task<string> DayAsync(string identifier, DateTimeOffset from, DateTimeOffset to) =>
        JsonAsync("trace-day.sql", "[]",
            ("Schema", _schema, SqlDbType.NVarChar),
            ("Identifier", identifier, SqlDbType.NVarChar),
            ("From", from, SqlDbType.DateTimeOffset),
            ("To", to, SqlDbType.DateTimeOffset));

    public Task<string> MonthAsync(string identifier, DateTimeOffset from, DateTimeOffset to, int offsetMinutes) =>
        JsonAsync("trace-month.sql", "[]",
            ("Schema", _schema, SqlDbType.NVarChar),
            ("Identifier", identifier, SqlDbType.NVarChar),
            ("From", from, SqlDbType.DateTimeOffset),
            ("To", to, SqlDbType.DateTimeOffset),
            ("OffsetMinutes", offsetMinutes, SqlDbType.Int));

    public Task<string> SessionAsync(string sessionId) =>
        JsonAsync("trace-session.sql", "{}",
            ("Schema", _schema, SqlDbType.NVarChar),
            ("SessionId", sessionId, SqlDbType.NVarChar),
            ("Max", SessionLimit, SqlDbType.Int));

    private async Task<string> JsonAsync(string file, string empty, params (string Name, object Value, SqlDbType Type)[] parameters)
    {
        var rows = await _scripts.ReadAsync(file, parameters);
        return rows.Count > 0 && rows[0]["JsonNode"] is string json && json.Length > 0 ? json : empty;
    }
}
