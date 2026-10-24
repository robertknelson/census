using System;
using System.Data;
using System.Linq;
using Gatehouse.CommandQuery;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace Gatehouse.Logs.Data;

// Log Explorer's, Trace's and Usage's reads as command/query keys (gatehouse.md §7): Census's apptrak/sql/logs scripts
// as they are. Each key names the parameters its script takes; the controller has checked every value, and the schema,
// the slow threshold and the friction thresholds come from settings, never from the request. The scripts check every
// name that reaches their dynamic SQL against the tables' own columns.
public class LogsSqlCommandInitializer : SqlCommandInitializer
{
    public const string Name = "logs";

    private static readonly (string Name, SqlDbType Type)[] Window = { ("From", SqlDbType.DateTimeOffset), ("To", SqlDbType.DateTimeOffset) };

    private static readonly (string Name, SqlDbType Type)[] UsageScope =
    {
        ("Application", SqlDbType.NVarChar), ("Stage", SqlDbType.NVarChar), ("From", SqlDbType.DateTimeOffset), ("To", SqlDbType.DateTimeOffset),
        ("OffsetMinutes", SqlDbType.Int), ("Excluded", SqlDbType.NVarChar),
    };

    public LogsSqlCommandInitializer(IOptions<LogsOptions> logs, IOptions<UsageOptions> usage)
    {
        var schema = logs.Value.Schema;
        var slowMs = logs.Value.SlowMs;
        var f = usage.Value.Friction;

        void Add(string action, string file, params (string Name, SqlDbType Type)[] fromRequest) =>
            Initializers.Add($"{Domain}.{Name}.{action}", (command, parameters, node) =>
            {
                command.CommandType = CommandType.Text;
                command.CommandText = SqlScript.Load($"logs/sql/{file}");
                command.Parameters.Add(new SqlParameter("@Schema", SqlDbType.NVarChar, 128) { Value = schema });
                foreach (var (name, type) in fromRequest)
                    command.Parameters.Add(new SqlParameter($"@{name}", type) { Value = parameters.TryGet(name, out object value) ? value : DBNull.Value });
            });

        Add("facets", "facets.sql", ("Table", SqlDbType.NVarChar), ("Start", SqlDbType.DateTimeOffset), ("End", SqlDbType.DateTimeOffset),
            ("Columns", SqlDbType.NVarChar), ("OffsetMinutes", SqlDbType.Int), ("HideHandshake", SqlDbType.Bit));
        Add("search", "search.sql", ("Table", SqlDbType.NVarChar), ("Start", SqlDbType.DateTimeOffset), ("End", SqlDbType.DateTimeOffset),
            ("Filters", SqlDbType.NVarChar), ("Operator", SqlDbType.NVarChar), ("HideHandshake", SqlDbType.Bit), ("Writes", SqlDbType.Bit),
            ("Refused", SqlDbType.Bit), ("MinElapsed", SqlDbType.Int), ("SortColumn", SqlDbType.NVarChar), ("SortDescending", SqlDbType.Bit),
            ("PageIndex", SqlDbType.Int), ("PageSize", SqlDbType.Int));

        Add("trace-people", "trace-people.sql", Window);
        Add("trace-day", "trace-day.sql", Window.Prepend(("Identifier", SqlDbType.NVarChar)).ToArray());
        Add("trace-month", "trace-month.sql", Window.Prepend(("Identifier", SqlDbType.NVarChar)).Append(("OffsetMinutes", SqlDbType.Int)).ToArray());
        Add("trace-session", "trace-session.sql", ("SessionId", SqlDbType.NVarChar), ("Max", SqlDbType.Int));

        Add("usage-applications", "usage-applications.sql", Window.Append(("Excluded", SqlDbType.NVarChar)).ToArray());
        Add("usage-summary", "usage-summary.sql", Window.Prepend(("Stage", SqlDbType.NVarChar)).Append(("Excluded", SqlDbType.NVarChar)).ToArray());
        Add("usage-arrivals", "usage-arrivals.sql", UsageScope);
        Add("usage-scope", "usage-scope.sql", ("Identifier", SqlDbType.NVarChar));
        foreach (var section in new[] { "overview", "pages", "people", "when" })
            Add($"usage-{section}", $"usage-{section}.sql", UsageScope);
        Add("usage-page", "usage-page.sql", UsageScope.Append(("Page", SqlDbType.NVarChar)).ToArray());
        Add("usage-paths", "usage-paths.sql", UsageScope.Append(("Cap", SqlDbType.Int)).ToArray());
        Add("usage-friction", "usage-friction.sql", UsageScope);

        // The thresholds every usage section may read: the slow request, and (friction, the summary) the signals' settings.
        foreach (var key in Initializers.Keys.Where(k => k.Contains(".usage-") && !k.EndsWith("applications") && !k.EndsWith("scope")).ToList())
        {
            var bind = Initializers[key];
            var friction = key.EndsWith("friction") || key.EndsWith("summary");
            Initializers[key] = (command, parameters, node) =>
            {
                bind(command, parameters, node);
                command.Parameters.Add(new SqlParameter("@SlowMs", SqlDbType.Int) { Value = slowMs });
                if (!friction) return;
                command.Parameters.AddRange(new[]
                {
                    new SqlParameter("@EndedWithinMinutes", SqlDbType.Int) { Value = f.EndedWithinMinutes },
                    new SqlParameter("@RefusedTimes", SqlDbType.Int) { Value = f.RefusedTimes },
                    new SqlParameter("@LoopLoads", SqlDbType.Int) { Value = f.LoopLoads },
                    new SqlParameter("@LoopSeconds", SqlDbType.Int) { Value = f.LoopSeconds },
                    new SqlParameter("@RetrySeconds", SqlDbType.Int) { Value = f.RetrySeconds },
                    new SqlParameter("@SlowMinRequests", SqlDbType.Int) { Value = f.SlowMinRequests },
                    new SqlParameter("@DeadEndFactor", SqlDbType.Float) { Value = f.DeadEndFactor },
                    new SqlParameter("@DeadEndMinRate", SqlDbType.Float) { Value = f.DeadEndMinRate },
                    new SqlParameter("@DeadEndMinViews", SqlDbType.Int) { Value = f.DeadEndMinViews },
                });
            };
        }
    }
}
