using System.Linq;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Gatehouse.CommandQuery;
using Gatehouse.FeatureManagement;
using Gatehouse.Identity;
using Gatehouse.Membership.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Gatehouse.Membership.Api;

// The visitor welcome's API (gatehouse.md §11): a signed-in non-member sees what they may ask for and their own latest
// request, and asks to join. Behind the fixed Visitor policy, never a feature. Who is asking is the Windows sign-in;
// nothing in the body can name anyone else.
[ApiController]
[Route("api/welcome")]
[Authorize(Policy = FeatureAccessPolicies.Visitor)]
public class WelcomeController(IJsonQueryHandler queries, IJsonCommandHandler commands) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var choices = await queries.QueryAsync(Key("welcome-choices"));
        if (!choices.IsOkay) return Refused(choices);
        var mine = await queries.QueryAsync(Key("welcome-mine").AddParam("username", Identifier));
        if (!mine.IsOkay) return Refused(mine);
        JsonArray Kind(string kind) => new(choices.Items.Where(c => (string)c["kind"] == kind)
            .Select(c => (JsonNode)new JsonObject { ["id"] = c["id"]?.DeepClone(), ["identifier"] = c["identifier"]?.DeepClone(), ["name"] = c["name"]?.DeepClone() })
            .ToArray());
        return Ok(new JsonObject
        {
            ["windowsIdentity"] = User.Identity?.Name,
            ["identifier"] = Identifier,
            ["applications"] = Kind("application"),
            ["roles"] = Kind("role"),
            ["request"] = mine.Model?.DeepClone(),
        });
    }

    [HttpPost("request")]
    public async Task<IActionResult> Ask([FromBody] JsonNode data)
    {
        var errors = MembershipRequests.Check<JoinRequest>(data, MembershipRequests.Validate);
        if (errors.Count > 0) return BadRequest(new { errors });
        var parameters = Key("request-create").AddParam("username", Identifier).AddParam("windowsIdentity", User.Identity?.Name);
        var response = await commands.ExecuteAsync(parameters, data);
        return response.IsOkay ? Ok(response.Model?.DeepClone()) : Refused(response);
    }

    private string Identifier => User.FindFirst(ClaimsTransformer.IdentifierClaim)?.Value;

    private static IParameters Key(string action) => new Parameters().CommandQuery(MembershipSqlCommandInitializer.Name, action);

    private IActionResult Refused(Response response) =>
        StatusCode(response.Status.HttpCode, new { errors = new[] { response.Status.Message } });
}
