using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Threading.Tasks;
using Census.Web.CommandQuery;
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

    private readonly LogsQueryHandler _queries;
    private readonly string _schema;

    public TraceReader(LogsQueryHandler queries, IOptions<LogsOptions> logs)
    {
        _schema = logs.Value.Schema;
        _queries = queries;
    }

    public bool Enabled => _queries.Enabled;

    private async Task<List<Dictionary<string, object>>> Read(string key, params (string Name, object Value)[] values) =>
        (await _queries.QueryAsync(ResponseExtensions.Key(key, values))).Rows();

    public Task<List<Dictionary<string, object>>> PeopleAsync(DateTimeOffset from, DateTimeOffset to) =>
        Read("trace.people",
            ("Schema", _schema),
            ("From", from),
            ("To", to));

    public Task<string> DayAsync(string identifier, DateTimeOffset from, DateTimeOffset to) =>
        JsonAsync("trace.day", "[]",
            ("Schema", _schema),
            ("Identifier", identifier),
            ("From", from),
            ("To", to));

    public Task<string> MonthAsync(string identifier, DateTimeOffset from, DateTimeOffset to, int offsetMinutes) =>
        JsonAsync("trace.month", "[]",
            ("Schema", _schema),
            ("Identifier", identifier),
            ("From", from),
            ("To", to),
            ("OffsetMinutes", offsetMinutes));

    public Task<string> SessionAsync(string sessionId) =>
        JsonAsync("trace.session", "{}",
            ("Schema", _schema),
            ("SessionId", sessionId),
            ("Max", SessionLimit));

    private async Task<string> JsonAsync(string file, string empty, params (string Name, object Value)[] parameters)
    {
        var rows = await Read(file, parameters);
        return rows.Count > 0 && rows[0]["JsonNode"] is string json && json.Length > 0 ? json : empty;
    }
}
