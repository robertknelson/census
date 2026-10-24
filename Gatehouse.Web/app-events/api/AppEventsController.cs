using System;
using System.Globalization;
using System.Linq;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Gatehouse.AppEvents.Data;
using Gatehouse.AppEvents.Logging;
using Gatehouse.CommandQuery;
using Gatehouse.FeatureManagement;
using Gatehouse.Logs.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement.Mvc;

namespace Gatehouse.AppEvents.Api;

// The units of work (gatehouse.md §12.6): those that started in a window, and one unit's events in order. Each kind is
// marked registered or not against the catalog (in AppTrak; the events are in the log tables). Behind logs.app-events.
[ApiController]
[Route("api/app-events")]
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
[FeatureGate(Features.LogsAppEvents)]
public class AppEventsController(LogsQueryHandler logs, IJsonQueryHandler queries, IOptions<AppEventOptions> options) : ControllerBase
{
    // Setting: the longest window one request reads.
    public static readonly TimeSpan Longest = TimeSpan.FromDays(95);

    private static readonly string[] Statuses = { "completed", "failed", "running", "stuck" };

    [HttpGet("works")]
    public async Task<IActionResult> Works(string from, string to, string @namespace = null, string commandName = null, string status = null)
    {
        if (!DateTimeOffset.TryParse(from, CultureInfo.InvariantCulture, DateTimeStyles.None, out var start)
            || !DateTimeOffset.TryParse(to, CultureInfo.InvariantCulture, DateTimeStyles.None, out var end) || end <= start)
            return BadRequest(new { message = "The window must be two moments, the second after the first." });
        if (end - start > Longest) return BadRequest(new { message = "Units of work are read at most a quarter at a time." });
        if (status != null && Array.IndexOf(Statuses, status) < 0) return BadRequest(new { message = $"Status must be one of {string.Join(", ", Statuses)}." });
        var response = await logs.QueryAsync(Key("works").AddParam("from", start).AddParam("to", end).AddParam("namespace", @namespace)
            .AddParam("commandName", commandName).AddParam("status", status).AddParam("stuckHours", options.Value.StuckHours));
        if (!response.IsOkay) return Refused(response);
        var registered = await RegisteredAsync();
        return Ok(new JsonArray(response.Items.Select(w =>
        {
            var row = w.DeepClone().AsObject();
            row["registered"] = registered.Contains(((string)w["namespace"], (string)w["commandName"]));
            return (JsonNode)row;
        }).ToArray()));
    }

    [HttpGet("work/{workUid}")]
    public async Task<IActionResult> Work(string workUid)
    {
        if (string.IsNullOrWhiteSpace(workUid) || workUid.Length > 36) return BadRequest(new { message = "Choose a unit of work." });
        var response = await logs.QueryAsync(Key("work").AddParam("workUid", workUid.Trim()));
        if (!response.IsOkay) return Refused(response);
        if (response.Items.Count == 0) return NotFound(new { message = "No events carry that unit of work." });
        var registered = await RegisteredAsync();
        var first = response.Items[0];
        return Ok(new JsonObject
        {
            ["workUid"] = workUid.Trim(),
            ["registered"] = registered.Contains(((string)first["namespace"], (string)first["commandName"])),
            ["stuckHours"] = options.Value.StuckHours,
            ["events"] = new JsonArray(response.Items.Select(i => i?.DeepClone()).ToArray()),
        });
    }

    private async Task<System.Collections.Generic.HashSet<(string, string)>> RegisteredAsync()
    {
        var kinds = await queries.QueryAsync(Key("kinds"));
        return kinds.Items.Where(k => (string)k["disposition"] == "current").Select(k => ((string)k["namespace"], (string)k["commandName"])).ToHashSet();
    }

    private static IParameters Key(string action) => new Parameters().CommandQuery(AppEventsSqlCommandInitializer.Name, action);

    private IActionResult Refused(Response response) => StatusCode(response.Status.HttpCode, new { message = response.Status.Message });
}
