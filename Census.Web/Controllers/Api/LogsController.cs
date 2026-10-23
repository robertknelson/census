using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.Services;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// Log Explorer's API (log-explorer-and-trace.md §4). No gate (R5: one user, troubleshooting).
// The window is two moments with an exclusive end; the browser owns "through the end of that day".
// A facet pick arrives as <Column>-in=a,b or <Column>-nin=a,b; the script checks the column.
[ApiController]
[Route("api/logs")]
public class LogsController(LogReader logs) : ControllerBase
{
    private static readonly string[] NotFacets = ["log-start", "log-end", "logical-operator", "hide-handshake", "min-elapsed", "profile-fields"];

    [HttpGet("{model}/facets")]
    public async Task<IActionResult> Facets(string model, string start, string end, [FromQuery(Name = "profile-fields")] string profileFields,
        int offset = 0, [FromQuery(Name = "hide-handshake")] bool hideHandshake = false)
    {
        if (!logs.Enabled) return NotFound(new { message = "No log database is configured (Logs:ConnectionString)." });
        if (!LogReader.Tables.TryGetValue(model, out var table)) return NotFound(new { message = $"Unknown log model '{model}'." });
        if (!TryWindow(start, end, out var from, out var to)) return BadRequest(new { message = "The window must be two moments, the second after the first." });
        var columns = (profileFields ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        try
        {
            return Ok(await logs.FacetsAsync(table, from, to, columns, Math.Clamp(offset, -840, 840), hideHandshake));
        }
        catch (SqlException e) when (e.Number == 50404)
        {
            return NotFound(new { message = e.Message });
        }
    }

    [HttpGet("{model}/search")]
    public async Task<IActionResult> Search(string model, [FromQuery(Name = "log-start")] string start, [FromQuery(Name = "log-end")] string end,
        [FromQuery(Name = "logical-operator")] string logicalOperator, string sortBy, int pageIndex = 0, int pageSize = 25,
        [FromQuery(Name = "hide-handshake")] bool hideHandshake = false, bool writes = false, bool refused = false,
        [FromQuery(Name = "min-elapsed")] int minElapsed = 0)
    {
        if (!logs.Enabled) return NotFound(new { message = "No log database is configured (Logs:ConnectionString)." });
        if (!LogReader.Tables.TryGetValue(model, out var table)) return NotFound(new { message = $"Unknown log model '{model}'." });
        if (!TryWindow(start, end, out var from, out var to)) return BadRequest(new { message = "The window must be two moments, the second after the first." });

        var filters = new List<LogFilter>();
        foreach (var (key, value) in Request.Query)
        {
            if (NotFacets.Contains(key, StringComparer.OrdinalIgnoreCase)) continue;
            var isIn = key.EndsWith("-in", StringComparison.OrdinalIgnoreCase);
            if (!isIn && !key.EndsWith("-nin", StringComparison.OrdinalIgnoreCase)) continue;
            var values = value.SelectMany(v => (v ?? string.Empty).Split(',')).ToList();
            if (values.Count > 0) filters.Add(new LogFilter(key[..key.LastIndexOf('-')], isIn, values));
        }

        var sort = (sortBy ?? string.Empty).Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var search = new LogSearch
        {
            Start = from,
            End = to,
            Filters = filters,
            Operator = string.Equals(logicalOperator, "or", StringComparison.OrdinalIgnoreCase) ? "OR" : "AND",
            HideHandshake = hideHandshake,
            Writes = writes,
            Refused = refused,
            MinElapsed = minElapsed,
            SortColumn = sort.Length > 0 ? sort[0] : null,
            SortDescending = sort.Length < 2 || !string.Equals(sort[1], "asc", StringComparison.OrdinalIgnoreCase),
            PageIndex = Math.Max(0, pageIndex),
            PageSize = Math.Clamp(pageSize, 1, 200),
        };
        try
        {
            var (items, total) = await logs.SearchAsync(table, search);
            return Ok(new { items, total });
        }
        catch (SqlException e) when (e.Number == 50404)
        {
            return NotFound(new { message = e.Message });
        }
    }

    private static bool TryWindow(string start, string end, out DateTimeOffset from, out DateTimeOffset to)
    {
        to = default;
        return DateTimeOffset.TryParse(start, CultureInfo.InvariantCulture, DateTimeStyles.None, out from)
            && DateTimeOffset.TryParse(end, CultureInfo.InvariantCulture, DateTimeStyles.None, out to)
            && to > from;
    }
}
