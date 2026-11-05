using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.CommandQuery;
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

    private readonly LogsQueryHandler _queries;
    private readonly string _schema;
    private readonly int _slowMs;
    private readonly FrictionOptions _friction;

    public UsageReader(LogsQueryHandler queries, IOptions<LogsOptions> logs, IOptions<UsageOptions> usage)
    {
        _friction = usage.Value.Friction;
        _schema = logs.Value.Schema;
        _slowMs = logs.Value.SlowMs;
        _queries = queries;
    }

    public bool Enabled => _queries.Enabled;

    private async Task<List<Dictionary<string, object>>> Read(string key, params (string Name, object Value)[] values) =>
        (await _queries.QueryAsync(ResponseExtensions.Key(key, values))).Rows();

    public Task<List<Dictionary<string, object>>> ApplicationsAsync(DateTimeOffset from, DateTimeOffset to) =>
        Read("usage.applications",
            ("Schema", _schema),
            ("From", from),
            ("To", to));

    // Every application's figures at once (usage.md §5, U5): the period view's row per application.
    public Task<string> SummaryAsync(string stage, DateTimeOffset from, DateTimeOffset to) =>
        JsonAsync("usage.summary", "[]",
            ("Schema", _schema),
            ("Stage", stage),
            ("From", from),
            ("To", to),
            ("EndedWithinMinutes", _friction.EndedWithinMinutes));

    public Task<string> SectionAsync(string section, UsageScope scope, string page = null)
    {
        var parameters = new List<(string, object)>
        {
            ("Schema", _schema),
            ("Application", scope.Application),
            ("Stage", scope.Stage),
            ("From", scope.From),
            ("To", scope.To),
            ("OffsetMinutes", scope.OffsetMinutes),
            ("SlowMs", _slowMs),
        };
        if (section == "page") parameters.Add(("Page", page));
        if (section == "paths") parameters.Add(("Cap", PathSessions));
        if (section == "friction")
        {
            parameters.Add(("EndedWithinMinutes", _friction.EndedWithinMinutes));
            parameters.Add(("RefusedTimes", _friction.RefusedTimes));
            parameters.Add(("LoopLoads", _friction.LoopLoads));
            parameters.Add(("LoopSeconds", _friction.LoopSeconds));
            parameters.Add(("RetrySeconds", _friction.RetrySeconds));
            parameters.Add(("SlowMinRequests", _friction.SlowMinRequests));
            parameters.Add(("DeadEndFactor", _friction.DeadEndFactor));
            parameters.Add(("DeadEndMinRate", _friction.DeadEndMinRate));
            parameters.Add(("DeadEndMinViews", _friction.DeadEndMinViews));
        }
        return JsonAsync($"usage.{section}", section is "overview" or "page" or "paths" or "friction" ? "{}" : "[]", parameters.ToArray());
    }

    private async Task<string> JsonAsync(string file, string empty, params (string Name, object Value)[] parameters)
    {
        var rows = await Read(file, parameters);
        return rows.Count > 0 && rows[0]["JsonNode"] is string json && json.Length > 0 ? json : empty;
    }
}

public record UsageScope(string Application, string Stage, DateTimeOffset From, DateTimeOffset To, int OffsetMinutes);
