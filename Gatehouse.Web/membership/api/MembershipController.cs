using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Gatehouse.CommandQuery;
using Gatehouse.FeatureManagement;
using Gatehouse.Identity;
using Gatehouse.Membership.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.FeatureManagement.Mvc;

namespace Gatehouse.Membership.Api;

// Census's membership API on command/query (gatehouse.md §7): the same routes and answers, so the page's module works
// as it is. Behind the same feature as the page (§6). Every write is attributed to the signed-in member and audited
// by its script (membership.MembershipAudit).
[ApiController]
[Route("api/membership")]
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
[FeatureGate(Features.AdminMembership)]
public class MembershipController(IJsonQueryHandler queries, IJsonCommandHandler commands) : ControllerBase
{
    [HttpGet("applications")]
    public Task<IActionResult> Applications() => Read("applications");

    [HttpGet("members")]
    public Task<IActionResult> Members() => Read("members");

    [HttpGet("lists")]
    public Task<IActionResult> Lists() => Read("lists");

    [HttpGet("app-parts")]
    public Task<IActionResult> AppParts() => Read("app-parts");

    [HttpGet("audit/recent")]
    public Task<IActionResult> RecentAudit() => Read("audit-recent");

    [HttpGet("audit/{entity}/{id:int}")]
    public async Task<IActionResult> Audit(string entity, int id)
    {
        if (entity is not ("application" or "member")) return NotFound();
        return await Read("audit", p => p.AddParam("entity", entity).AddParam("id", id));
    }

    [HttpPost("applications")]
    public Task<IActionResult> CreateApplication([FromBody] JsonNode data) => Write<ApplicationSave>("application-save", null, data, MembershipRequests.Validate);

    [HttpPost("applications/{id:int}")]
    public Task<IActionResult> UpdateApplication(int id, [FromBody] JsonNode data) => Write<ApplicationSave>("application-save", id, data, MembershipRequests.Validate);

    [HttpPost("members")]
    public Task<IActionResult> CreateMember([FromBody] JsonNode data) => Write<MemberSave>("member-save", null, data, MembershipRequests.Validate);

    [HttpPost("members/{id:int}")]
    public Task<IActionResult> UpdateMember(int id, [FromBody] JsonNode data) => Write<MemberSave>("member-save", id, data, MembershipRequests.Validate);

    [HttpPost("applications/{id:int}/delete")]
    public Task<IActionResult> DeleteApplication(int id) => Execute("application-delete", id, new JsonObject());

    [HttpPost("members/{id:int}/delete")]
    public Task<IActionResult> DeleteMember(int id) => Execute("member-delete", id, new JsonObject());

    [HttpPost("parts/save")]
    public Task<IActionResult> SavePart([FromBody] JsonNode data) => Write<AppPartSave>("part-save", null, data, MembershipRequests.Validate);

    [HttpPost("parts/delete")]
    public Task<IActionResult> DeletePart([FromBody] JsonNode data) => Write<AppPartSave>("part-delete", null, data, MembershipRequests.ValidateDelete);

    [HttpPost("grants/grant")]
    public Task<IActionResult> Grant([FromBody] JsonNode data) => Write<GrantSave>("grant-save", null, data, MembershipRequests.Validate, p => p.AddParam("revoke", false));

    [HttpPost("grants/revoke")]
    public Task<IActionResult> Revoke([FromBody] JsonNode data) => Write<GrantSave>("grant-save", null, data, MembershipRequests.Validate, p => p.AddParam("revoke", true));

    private static IParameters Key(string action) => new Parameters().CommandQuery(MembershipSqlCommandInitializer.Name, action);

    private async Task<IActionResult> Read(string action, Func<IParameters, IParameters> with = null)
    {
        var parameters = Key(action);
        var response = await queries.QueryAsync(with?.Invoke(parameters) ?? parameters);
        return response.IsOkay ? Ok(new JsonArray(response.Items.Select(i => i?.DeepClone()).ToArray())) : Refused(response);
    }

    private async Task<IActionResult> Write<T>(string action, int? id, JsonNode data, Func<T, List<string>> validate, Func<IParameters, IParameters> with = null)
    {
        var errors = MembershipRequests.Check(data, validate);
        if (errors.Count > 0) return BadRequest(new { errors });
        return await Execute(action, id, data, with);
    }

    private async Task<IActionResult> Execute(string action, int? id, JsonNode data, Func<IParameters, IParameters> with = null)
    {
        var parameters = Key(action).AddParam("username", User.FindFirst(ClaimsTransformer.IdentifierClaim)?.Value ?? User.Identity?.Name);
        if (id.HasValue) parameters.AddParam("id", id.Value);
        var response = await commands.ExecuteAsync(with?.Invoke(parameters) ?? parameters, data);
        return response.IsOkay ? Ok(new { key = response.Model?["key"]?.DeepClone() }) : Refused(response);
    }

    private IActionResult Refused(Response response) =>
        StatusCode(response.Status.HttpCode, new { errors = new[] { response.Status.Message } });
}
