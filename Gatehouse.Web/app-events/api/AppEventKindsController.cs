using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Gatehouse.AppEvents.Data;
using Gatehouse.CommandQuery;
using Gatehouse.FeatureManagement;
using Gatehouse.Identity;
using Gatehouse.Logs.Api;
using Gatehouse.Membership.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.FeatureManagement.Mvc;

namespace Gatehouse.AppEvents.Api;

// The catalog of kinds' API (gatehouse.md §12.3): the registered kinds beside the kinds the events name, so a kind seen
// but not registered can be registered; register, correct, retire; the history. Behind admin.app-event-kinds.
[ApiController]
[Route("api/app-event-kinds")]
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
[FeatureGate(Features.AdminAppEventKinds)]
public class AppEventKindsController(IJsonQueryHandler queries, IJsonCommandHandler commands, LogsQueryHandler logs) : ControllerBase
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var kinds = await queries.QueryAsync(Key("kinds"));
        if (!kinds.IsOkay) return Refused(kinds);
        var seen = await logs.QueryAsync(Key("kinds-seen").AddParam("days", 30));
        if (!seen.IsOkay) return Refused(seen);
        var applications = await queries.QueryAsync(new Parameters().CommandQuery(MembershipSqlCommandInitializer.Name, "applications"));
        if (!applications.IsOkay) return Refused(applications);

        var counts = seen.Items.ToDictionary(s => ((string)s["namespace"], (string)s["commandName"]), s => s);
        var registered = kinds.Items.Select(k =>
        {
            var row = k.DeepClone().AsObject();
            row["recent"] = counts.TryGetValue(((string)k["namespace"], (string)k["commandName"]), out var c) ? c["recent"]?.DeepClone() : 0;
            row["lastSeen"] = c?["lastSeen"]?.DeepClone();
            return (JsonNode)row;
        }).ToArray();
        var names = kinds.Items.Select(k => ((string)k["namespace"], (string)k["commandName"])).ToHashSet();
        return Ok(new JsonObject
        {
            ["kinds"] = new JsonArray(registered),
            ["unregistered"] = new JsonArray(seen.Items.Where(s => !names.Contains(((string)s["namespace"], (string)s["commandName"]))).Select(s => s.DeepClone()).ToArray()),
            ["applications"] = new JsonArray(applications.Items.Select(a => (JsonNode)new JsonObject { ["id"] = a["applicationId"]?.DeepClone(), ["name"] = a["name"]?.DeepClone() }).ToArray()),
        });
    }

    [HttpGet("audit")]
    public async Task<IActionResult> RecentAudit() => Rows(await queries.QueryAsync(Key("kind-audit")));

    [HttpGet("{id:int}/audit")]
    public async Task<IActionResult> Audit(int id) => Rows(await queries.QueryAsync(Key("kind-audit").AddParam("id", id)));

    [HttpPost]
    public Task<IActionResult> Create([FromBody] JsonNode data) => Save(null, data);

    [HttpPost("{id:int}")]
    public Task<IActionResult> Update(int id, [FromBody] JsonNode data) => Save(id, data);

    private async Task<IActionResult> Save(int? id, JsonNode data)
    {
        var errors = Check(data);
        if (errors.Count > 0) return BadRequest(new { errors });
        var parameters = Key("kind-save").AddParam("username", User.FindFirst(ClaimsTransformer.IdentifierClaim)?.Value ?? User.Identity?.Name);
        if (id.HasValue) parameters.AddParam("id", id.Value);
        var response = await commands.ExecuteAsync(parameters, data);
        return response.IsOkay ? Ok(response.Model?.DeepClone()) : Refused(response);
    }

    // Every reason at once, in the screen's words (the boundary, as Membership's checks are).
    private static List<string> Check(JsonNode data)
    {
        KindSave kind;
        try
        {
            kind = data is JsonObject ? data.Deserialize<KindSave>(Web) : null;
        }
        catch (JsonException)
        {
            kind = null;
        }
        if (kind == null) return new List<string> { "The request body is not in the shape this screen sends." };
        var errors = new List<string>();
        void Add(string error) { if (error != null) errors.Add(error); }
        Add(AppEventNames.CheckNamespace(kind.Namespace?.Trim()));
        Add(AppEventNames.CheckCommandName(kind.CommandName?.Trim()));
        if (string.IsNullOrWhiteSpace(kind.DisplayName)) errors.Add("Display name is required.");
        else if (kind.DisplayName.Trim().Length > 100) errors.Add("Display name can be at most 100 characters.");
        if ((kind.Description ?? "").Trim().Length > 500) errors.Add("Description can be at most 500 characters.");
        if (kind.Disposition is not (null or "current" or "retired")) errors.Add("Disposition must be current or retired.");
        return errors;
    }

    private static IParameters Key(string action) => new Parameters().CommandQuery(AppEventsSqlCommandInitializer.Name, action);

    private IActionResult Rows(Response<JsonNode> response) =>
        response.IsOkay ? Ok(new JsonArray(response.Items.Select(i => i?.DeepClone()).ToArray())) : Refused(response);

    private IActionResult Refused(Response response) =>
        StatusCode(response.Status.HttpCode, new { errors = new[] { response.Status.Message } });

    private sealed class KindSave
    {
        public string Namespace { get; set; }
        public string CommandName { get; set; }
        public string DisplayName { get; set; }
        public string Description { get; set; }
        public int? ApplicationId { get; set; }
        public string Disposition { get; set; }
    }
}
