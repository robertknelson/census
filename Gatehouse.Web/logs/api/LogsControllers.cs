using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Gatehouse.CommandQuery;
using Gatehouse.FeatureManagement;
using Gatehouse.Logs.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.FeatureManagement.Mvc;

namespace Gatehouse.Logs.Api;

// The log tables have a connection of their own ("logs", gatehouse.md §8): locally Census's CensusLogsDemo, in the live
// app AppTrak (point it where "default" points).
public class LogsQueryHandler(IInitializerLocator locator, ILogger<JsonQueryHandler> logger, IConfiguration configuration)
    : JsonQueryHandler(locator, logger, configuration)
{
    public override string ConnectionKey => "logs";
}

// What the three APIs share: a window of two moments, the second after the first; the scripts' refusals in their words.
public abstract class LogsApiController(LogsQueryHandler queries) : ControllerBase
{
    protected static IParameters Key(string action) => new Parameters().CommandQuery(LogsSqlCommandInitializer.Name, action);

    protected Task<Response<JsonNode>> QueryAsync(IParameters parameters) => queries.QueryAsync(parameters);

    protected IActionResult Rows(Response<JsonNode> response) =>
        response.IsOkay ? Ok(new JsonArray(response.Items.Select(i => i?.DeepClone()).ToArray())) : Refused(response);

    protected IActionResult Document(Response<JsonNode> response) =>
        response.IsOkay ? Ok(response.Model?.DeepClone() ?? new JsonObject()) : Refused(response);

    protected IActionResult Refused(Response response) => StatusCode(response.Status.HttpCode, new { message = response.Status.Message });

    protected static bool TryMoment(string value, out DateTimeOffset moment) =>
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out moment);

    protected static bool TryWindow(string from, string to, out DateTimeOffset start, out DateTimeOffset end)
    {
        end = default;
        return TryMoment(from, out start) && TryMoment(to, out end) && end > start;
    }

    protected static string Camel(string name) => string.IsNullOrEmpty(name) ? name : char.ToLowerInvariant(name[0]) + name[1..];
}

// Log Explorer's API (Census's LogsController): facets and a page of rows of one log table. A facet pick arrives as
// <Column>-in=a,b or <Column>-nin=a,b; the script checks the column.
[ApiController]
[Route("api/logs")]
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
[FeatureGate(Features.LogsExplorer)]
public class LogsController(LogsQueryHandler queries, Microsoft.FeatureManagement.IFeatureManager features) : LogsApiController(queries)
{
    public static readonly IReadOnlyDictionary<string, string> Tables = new Dictionary<string, string>
    {
        ["api-request"] = "ApiRequest",
        ["exception-event"] = "Exception",
        ["message"] = "Message",
        ["app-event"] = "AppEvent",
    };

    // AppEvent's rows need their own feature as well as the explorer's (gatehouse.md §12.6).
    private static readonly Dictionary<string, string> ModelFeatures = new() { ["app-event"] = Features.LogsAppEvents };

    private static readonly string[] NotFacets = { "log-start", "log-end", "logical-operator", "hide-handshake", "min-elapsed", "profile-fields" };

    [HttpGet("{model}/facets")]
    public async Task<IActionResult> Facets(string model, string start, string end, [FromQuery(Name = "profile-fields")] string profileFields,
        int offset = 0, [FromQuery(Name = "hide-handshake")] bool hideHandshake = false)
    {
        if (!Tables.TryGetValue(model, out var table)) return NotFound(new { message = $"Unknown log model '{model}'." });
        if (!await MayReadAsync(model)) return StatusCode(403, new { message = "This model needs a feature you do not have." });
        if (!TryWindow(start, end, out var from, out var to)) return BadRequest(new { message = "The window must be two moments, the second after the first." });
        var columns = (profileFields ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var response = await QueryAsync(Key("facets").AddParam("Table", table).AddParam("Start", from).AddParam("End", to)
            .AddParam("Columns", JsonSerializer.Serialize(columns)).AddParam("OffsetMinutes", Math.Clamp(offset, -840, 840)).AddParam("HideHandshake", hideHandshake));
        if (!response.IsOkay) return Refused(response);
        return Ok(response.Items
            .GroupBy(r => (string)r["facet"])
            .Select(g => new { name = Camel(g.Key), items = g.Select(r => new { value = r["value"]?.DeepClone(), count = r["count"]?.DeepClone() }).ToList() })
            .ToList());
    }

    [HttpGet("{model}/search")]
    public async Task<IActionResult> Search(string model, [FromQuery(Name = "log-start")] string start, [FromQuery(Name = "log-end")] string end,
        [FromQuery(Name = "logical-operator")] string logicalOperator, string sortBy, int pageIndex = 0, int pageSize = 25,
        [FromQuery(Name = "hide-handshake")] bool hideHandshake = false, bool writes = false, bool refused = false,
        [FromQuery(Name = "min-elapsed")] int minElapsed = 0)
    {
        if (!Tables.TryGetValue(model, out var table)) return NotFound(new { message = $"Unknown log model '{model}'." });
        if (!await MayReadAsync(model)) return StatusCode(403, new { message = "This model needs a feature you do not have." });
        if (!TryWindow(start, end, out var from, out var to)) return BadRequest(new { message = "The window must be two moments, the second after the first." });

        var filters = new List<object>();
        foreach (var (key, value) in Request.Query)
        {
            if (NotFacets.Contains(key, StringComparer.OrdinalIgnoreCase)) continue;
            var isIn = key.EndsWith("-in", StringComparison.OrdinalIgnoreCase);
            if (!isIn && !key.EndsWith("-nin", StringComparison.OrdinalIgnoreCase)) continue;
            var values = value.SelectMany(v => (v ?? string.Empty).Split(',')).ToList();
            if (values.Count > 0) filters.Add(new { column = key[..key.LastIndexOf('-')], @in = isIn, values });
        }

        var sort = (sortBy ?? string.Empty).Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var response = await QueryAsync(Key("search").AddParam("Table", table).AddParam("Start", from).AddParam("End", to)
            .AddParam("Filters", JsonSerializer.Serialize(filters))
            .AddParam("Operator", string.Equals(logicalOperator, "or", StringComparison.OrdinalIgnoreCase) ? "OR" : "AND")
            .AddParam("HideHandshake", hideHandshake).AddParam("Writes", writes).AddParam("Refused", refused).AddParam("MinElapsed", minElapsed)
            .AddParam("SortColumn", sort.Length > 0 ? sort[0] : null)
            .AddParam("SortDescending", sort.Length < 2 || !string.Equals(sort[1], "asc", StringComparison.OrdinalIgnoreCase))
            .AddParam("PageIndex", Math.Max(0, pageIndex)).AddParam("PageSize", Math.Clamp(pageSize, 1, 200)));
        if (!response.IsOkay) return Refused(response);
        var total = response.Items.Count > 0 ? Convert.ToInt32(response.Items[0]["total"].GetValue<object>()) : 0;
        var items = response.Items.Select(r =>
        {
            var row = r.DeepClone().AsObject();
            row.Remove("total");
            return row;
        }).ToList();
        return Ok(new { items, total });
    }

    private async Task<bool> MayReadAsync(string model) =>
        !ModelFeatures.TryGetValue(model, out var feature) || await features.IsEnabledAsync(feature);
}

// Trace's API (Census's TraceController): an identifier's month and day, one session's timeline. Windows are two
// moments sent by the browser for its own day and month.
[ApiController]
[Route("api/trace")]
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
[FeatureGate(Features.LogsTrace)]
public class TraceController(LogsQueryHandler queries) : LogsApiController(queries)
{
    // Settings: the longest windows one request reads, and the most requests one session's timeline reads (newest kept).
    public static readonly TimeSpan LongestDay = TimeSpan.FromDays(2);
    public static readonly TimeSpan LongestMonth = TimeSpan.FromDays(32);
    public const int SessionLimit = 3000;

    [HttpGet("people")]
    public Task<IActionResult> People(string from, string to) => Read("trace-people", from, to, LongestMonth, p => p);

    [HttpGet("day")]
    public Task<IActionResult> Day(string person, string from, string to) =>
        string.IsNullOrWhiteSpace(person)
            ? Task.FromResult<IActionResult>(BadRequest(new { message = "Choose a person." }))
            : Read("trace-day", from, to, LongestDay, p => p.AddParam("Identifier", person.Trim()));

    [HttpGet("month")]
    public Task<IActionResult> Month(string person, string from, string to, int offset = 0) =>
        string.IsNullOrWhiteSpace(person)
            ? Task.FromResult<IActionResult>(BadRequest(new { message = "Choose a person." }))
            : Read("trace-month", from, to, LongestMonth, p => p.AddParam("Identifier", person.Trim()).AddParam("OffsetMinutes", Math.Clamp(offset, -840, 840)));

    [HttpGet("session")]
    public async Task<IActionResult> Session(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return BadRequest(new { message = "Choose a session." });
        return Document(await QueryAsync(Key("trace-session").AddParam("SessionId", id.Trim()).AddParam("Max", SessionLimit)));
    }

    private async Task<IActionResult> Read(string action, string from, string to, TimeSpan longest, Func<IParameters, IParameters> with)
    {
        if (!TryWindow(from, to, out var start, out var end)) return BadRequest(new { message = "The window must be two moments, the second after the first." });
        if (end - start > longest) return BadRequest(new { message = $"Trace reads at most {longest.TotalDays:0} days at a time." });
        return Rows(await QueryAsync(with(Key(action).AddParam("From", start).AddParam("To", end))));
    }
}

// Usage's API (Census's UsageController): how one application is used over a period. One application, a stage (absent:
// every stage), a window the browser sends for its own period, at most a quarter and a few days.
[ApiController]
[Route("api/usage")]
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
[FeatureGate(Features.LogsUsage)]
public class UsageController(LogsQueryHandler queries) : LogsApiController(queries)
{
    // Settings: the longest window one request reads (a quarter, with room for the browser's offset), and the most
    // sessions the path trees read (the newest are kept, and the page says so).
    public static readonly TimeSpan Longest = TimeSpan.FromDays(95);
    public const int PathSessions = 5000;

    // A section answers with one document (overview, page, paths, friction) or a list (pages, people, when).
    private static readonly Dictionary<string, bool> Sections = new()
    {
        ["overview"] = true, ["page"] = true, ["paths"] = true, ["friction"] = true, ["pages"] = false, ["people"] = false, ["when"] = false,
    };

    [HttpGet("applications")]
    public async Task<IActionResult> Applications(string from, string to)
    {
        if (!TryWindow(from, to, out var start, out var end, out var problem)) return BadRequest(new { message = problem });
        return Rows(await QueryAsync(Key("usage-applications").AddParam("From", start).AddParam("To", end)));
    }

    [HttpGet("{section}")]
    public async Task<IActionResult> Section(string section, string application, string stage, string from, string to, int offset = 0, string page = null)
    {
        if (!Sections.TryGetValue(section, out var document)) return NotFound(new { message = $"Unknown section '{section}'." });
        if (string.IsNullOrWhiteSpace(application)) return BadRequest(new { message = "Choose an application." });
        if (section == "page" && string.IsNullOrWhiteSpace(page)) return BadRequest(new { message = "Choose a page." });
        if (!TryWindow(from, to, out var start, out var end, out var problem)) return BadRequest(new { message = problem });
        var parameters = Key($"usage-{section}").AddParam("Application", application.Trim()).AddParam("Stage", string.IsNullOrWhiteSpace(stage) ? null : stage.Trim())
            .AddParam("From", start).AddParam("To", end).AddParam("OffsetMinutes", Math.Clamp(offset, -840, 840));
        if (section == "page") parameters.AddParam("Page", page.Trim());
        if (section == "paths") parameters.AddParam("Cap", PathSessions);
        var response = await QueryAsync(parameters);
        return document ? Document(response) : Rows(response);
    }

    private static bool TryWindow(string from, string to, out DateTimeOffset start, out DateTimeOffset end, out string problem)
    {
        problem = null;
        if (!TryWindow(from, to, out start, out end)) problem = "The window must be two moments, the second after the first.";
        else if (end - start > Longest) problem = "Usage reads at most a quarter at a time.";
        return problem == null;
    }
}
