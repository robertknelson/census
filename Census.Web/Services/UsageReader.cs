using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

// Usage's reads (usage.md): how one application is used over a period, computed live from the log
// tables through apptrak/sql/logs/usage-*.sql, no roll-up (U3). The section scripts answer with one
// JSON document, passed through as it is.
public class UsageReader
{
    // Setting: the most sessions the path trees read (usage.md §4.3); the newest are kept, and the page says so.
    public const int PathSessions = 5000;

    private readonly ScriptRunner _scripts;
    private readonly string _schema;
    private readonly int _slowMs;
    private readonly FrictionOptions _friction;

    public UsageReader(IOptions<LogsOptions> logs, IOptions<UsageOptions> usage, IOptions<MoveItOptions> moveIt, IWebHostEnvironment env)
    {
        _friction = usage.Value.Friction;
        var connection = string.IsNullOrWhiteSpace(logs.Value.ConnectionString) ? moveIt.Value.ConnectionString : logs.Value.ConnectionString;
        _schema = logs.Value.Schema;
        _slowMs = logs.Value.SlowMs;
        _scripts = new ScriptRunner(Path.GetFullPath(Path.Combine(env.ContentRootPath, moveIt.Value.SqlPath, "logs")), connection);
    }

    public bool Enabled => _scripts.Enabled;

    public Task<List<Dictionary<string, object>>> ApplicationsAsync(DateTimeOffset from, DateTimeOffset to) =>
        _scripts.ReadAsync("usage-applications.sql",
            ("Schema", _schema, SqlDbType.NVarChar),
            ("From", from, SqlDbType.DateTimeOffset),
            ("To", to, SqlDbType.DateTimeOffset));

    public Task<string> SectionAsync(string section, UsageScope scope, string page = null)
    {
        var parameters = new List<(string, object, SqlDbType)>
        {
            ("Schema", _schema, SqlDbType.NVarChar),
            ("Application", scope.Application, SqlDbType.NVarChar),
            ("Stage", scope.Stage, SqlDbType.NVarChar),
            ("From", scope.From, SqlDbType.DateTimeOffset),
            ("To", scope.To, SqlDbType.DateTimeOffset),
            ("OffsetMinutes", scope.OffsetMinutes, SqlDbType.Int),
            ("SlowMs", _slowMs, SqlDbType.Int),
        };
        if (section == "page") parameters.Add(("Page", page, SqlDbType.NVarChar));
        if (section == "paths") parameters.Add(("Cap", PathSessions, SqlDbType.Int));
        if (section == "friction")
        {
            parameters.Add(("EndedWithinMinutes", _friction.EndedWithinMinutes, SqlDbType.Int));
            parameters.Add(("RefusedTimes", _friction.RefusedTimes, SqlDbType.Int));
            parameters.Add(("LoopLoads", _friction.LoopLoads, SqlDbType.Int));
            parameters.Add(("LoopSeconds", _friction.LoopSeconds, SqlDbType.Int));
            parameters.Add(("RetrySeconds", _friction.RetrySeconds, SqlDbType.Int));
            parameters.Add(("SlowMinRequests", _friction.SlowMinRequests, SqlDbType.Int));
            parameters.Add(("DeadEndFactor", _friction.DeadEndFactor, SqlDbType.Float));
            parameters.Add(("DeadEndMinRate", _friction.DeadEndMinRate, SqlDbType.Float));
            parameters.Add(("DeadEndMinViews", _friction.DeadEndMinViews, SqlDbType.Int));
        }
        return JsonAsync($"usage-{section}.sql", section is "overview" or "page" or "paths" or "friction" ? "{}" : "[]", parameters.ToArray());
    }

    private async Task<string> JsonAsync(string file, string empty, params (string Name, object Value, SqlDbType Type)[] parameters)
    {
        var rows = await _scripts.ReadAsync(file, parameters);
        return rows.Count > 0 && rows[0]["JsonNode"] is string json && json.Length > 0 ? json : empty;
    }
}

public record UsageScope(string Application, string Stage, DateTimeOffset From, DateTimeOffset To, int OffsetMinutes);
