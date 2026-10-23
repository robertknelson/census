using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Census.Web.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

// Log Explorer's reads (log-explorer-and-trace.md §4): facets and a page of rows from one of the
// shared log tables, through apptrak/sql/logs. The scripts check every name against the table's
// own columns; this class only maps the model to its table and shapes the result.
public class LogReader
{
    public static readonly IReadOnlyDictionary<string, string> Tables = new Dictionary<string, string>
    {
        ["api-request"] = "ApiRequest",
        ["exception-event"] = "Exception",
        ["message"] = "Message",
    };

    private readonly ScriptRunner _scripts;

    public LogReader(IOptions<LogsOptions> logs, IOptions<MoveItOptions> moveIt, IWebHostEnvironment env)
    {
        var connection = string.IsNullOrWhiteSpace(logs.Value.ConnectionString) ? moveIt.Value.ConnectionString : logs.Value.ConnectionString;
        _scripts = new ScriptRunner(Path.GetFullPath(Path.Combine(env.ContentRootPath, moveIt.Value.SqlPath, "logs")), connection);
    }

    public bool Enabled => _scripts.Enabled;

    public async Task<List<Dictionary<string, object>>> FacetsAsync(string table, DateTimeOffset start, DateTimeOffset end, IEnumerable<string> columns, int offsetMinutes, bool hideHandshake)
    {
        var rows = await _scripts.ReadAsync("facets.sql",
            ("Table", table, SqlDbType.NVarChar),
            ("Start", start, SqlDbType.DateTimeOffset),
            ("End", end, SqlDbType.DateTimeOffset),
            ("Columns", JsonSerializer.Serialize(columns), SqlDbType.NVarChar),
            ("OffsetMinutes", offsetMinutes, SqlDbType.Int),
            ("HideHandshake", hideHandshake, SqlDbType.Bit));
        return rows
            .GroupBy(r => (string)r["Facet"])
            .Select(g => new Dictionary<string, object>
            {
                ["name"] = Camel(g.Key),
                ["items"] = g.Select(r => new { value = r["Value"], count = r["Count"] }).ToList(),
            })
            .ToList();
    }

    public async Task<(List<Dictionary<string, object>> Items, int Total)> SearchAsync(string table, LogSearch search)
    {
        var rows = await _scripts.ReadAsync("search.sql",
            ("Table", table, SqlDbType.NVarChar),
            ("Start", search.Start, SqlDbType.DateTimeOffset),
            ("End", search.End, SqlDbType.DateTimeOffset),
            ("Filters", JsonSerializer.Serialize(search.Filters.Select(f => new { column = f.Column, @in = f.In, values = f.Values })), SqlDbType.NVarChar),
            ("Operator", search.Operator, SqlDbType.NVarChar),
            ("HideHandshake", search.HideHandshake, SqlDbType.Bit),
            ("Writes", search.Writes, SqlDbType.Bit),
            ("Refused", search.Refused, SqlDbType.Bit),
            ("MinElapsed", search.MinElapsed, SqlDbType.Int),
            ("SortColumn", search.SortColumn, SqlDbType.NVarChar),
            ("SortDescending", search.SortDescending, SqlDbType.Bit),
            ("PageIndex", search.PageIndex, SqlDbType.Int),
            ("PageSize", search.PageSize, SqlDbType.Int));
        var total = rows.Count > 0 ? Convert.ToInt32(rows[0]["Total"]) : 0;
        var items = rows.Select(r => r.Where(kv => kv.Key != "Total").ToDictionary(kv => Camel(kv.Key), kv => kv.Value)).ToList();
        return (items, total);
    }

    private static string Camel(string name) => string.IsNullOrEmpty(name) ? name : char.ToLowerInvariant(name[0]) + name[1..];
}

public record LogFilter(string Column, bool In, List<string> Values);

public class LogSearch
{
    public DateTimeOffset Start { get; init; }
    public DateTimeOffset End { get; init; }
    public List<LogFilter> Filters { get; init; } = [];
    public string Operator { get; init; } = "AND";
    public bool HideHandshake { get; init; }
    public bool Writes { get; init; }
    public bool Refused { get; init; }
    public int MinElapsed { get; init; }
    public string SortColumn { get; init; }
    public bool SortDescending { get; init; } = true;
    public int PageIndex { get; init; }
    public int PageSize { get; init; } = 25;
}
