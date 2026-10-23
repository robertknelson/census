using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Gatehouse.CommandQuery;
using Gatehouse.FeatureManagement.Data;
using Gatehouse.FeatureManagement.Evaluation;
using Gatehouse.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Gatehouse.FeatureManagement.Api;

// FM2280's admin API on command/query (G-R10): the same routes and answers as FM2280's, so its admin page works as it
// is. Guarded by the fixed admin policy, never a feature (§6). The payload is checked here, at the boundary; the
// initializer binds it; a write drops the definition cache so the change applies at once.
[ApiController]
[Route("api/feature-access")]
[Authorize(Policy = FeatureAccessPolicies.Admin)]
public class FeatureAccessController(
    FeatureQueryHandler queries,
    FeatureCommandHandler commands,
    IRoleCatalog roleCatalog,
    FeatureGateScanner scanner,
    FeatureDefinitionStore store) : ControllerBase
{
    private static readonly Regex NamePattern = new("^[a-z0-9]+([.-][a-z0-9]+)*$", RegexOptions.Compiled);

    [HttpGet("features")]
    public async Task<IActionResult> List(bool includeVoided = false)
    {
        var response = await queries.QueryAsync(Key("list").AddParam("includeVoided", includeVoided));
        return response.IsOkay ? Ok(response.Model?["features"] ?? new JsonArray()) : Refused(response);
    }

    [HttpGet("features/{featureId:int}")]
    public async Task<IActionResult> Get(int featureId) => Feature(await queries.QueryAsync(Key("get").AddParam("featureId", featureId)));

    [HttpGet("features/{featureId:int}/audit")]
    public async Task<IActionResult> Audit(int featureId)
    {
        var response = await queries.QueryAsync(Key("audit").AddParam("featureId", featureId));
        return response.IsOkay ? Ok(new JsonArray(response.Items.Select(i => i?.DeepClone()).ToArray())) : Refused(response);
    }

    [HttpGet("roles")]
    public async Task<IActionResult> Roles() => Ok(await roleCatalog.GetRoleNamesAsync());

    [HttpGet("gate-scan")]
    public async Task<IActionResult> GateScan() => Ok(await scanner.ScanAsync());

    [HttpPost("features")]
    public async Task<IActionResult> Create([FromBody] JsonNode data)
    {
        var payload = new Payload(data);
        var name = payload.String("name", 100, required: true);
        if (name != null && !NamePattern.IsMatch(name)) payload.Errors.Add("'name' must be lowercase letters and digits separated by '.' or '-', e.g. 'logs.explorer'.");
        payload.String("displayName", 150, required: true);
        payload.String("description", 1000, required: false);
        payload.Bool("isEnabled", required: false);
        var roles = await KnownRolesAsync(payload, payload.Strings("roles"));
        if (payload.Errors.Count > 0) return Invalid(payload);
        var body = data.DeepClone().AsObject();
        body["name"] = name;
        body["roles"] = new JsonArray(roles.Select(r => (JsonNode)r).ToArray());
        return await WriteAsync("create", null, body);
    }

    [HttpPost("features/{featureId:int}/update")]
    public async Task<IActionResult> Update(int featureId, [FromBody] JsonNode data)
    {
        var payload = new Payload(data);
        payload.String("displayName", 150, required: true);
        payload.String("description", 1000, required: false);
        payload.RowVersion();
        return payload.Errors.Count > 0 ? Invalid(payload) : await WriteAsync("update", featureId, data);
    }

    [HttpPost("features/{featureId:int}/set-enabled")]
    public async Task<IActionResult> SetEnabled(int featureId, [FromBody] JsonNode data)
    {
        var payload = new Payload(data);
        payload.Bool("isEnabled", required: true);
        payload.RowVersion();
        return payload.Errors.Count > 0 ? Invalid(payload) : await WriteAsync("set-enabled", featureId, data);
    }

    // Void is not exposed (FM2280 D13): retiring a feature name ships as a migration with the commit that removes its gate.

    [HttpPost("features/{featureId:int}/roles/grant")]
    public async Task<IActionResult> GrantRole(int featureId, [FromBody] JsonNode data)
    {
        var payload = new Payload(data);
        var role = payload.String("roleName", 100, required: true);
        var known = role == null ? new List<string>() : await KnownRolesAsync(payload, new[] { role });
        if (payload.Errors.Count > 0) return Invalid(payload);
        return await WriteAsync("role-grant", featureId, new JsonObject { ["roleName"] = known[0] });
    }

    // Not checked against the catalog, so a role the app no longer has can still be removed.
    [HttpPost("features/{featureId:int}/roles/revoke")]
    public async Task<IActionResult> RevokeRole(int featureId, [FromBody] JsonNode data)
    {
        var payload = new Payload(data);
        payload.String("roleName", 100, required: true);
        return payload.Errors.Count > 0 ? Invalid(payload) : await WriteAsync("role-revoke", featureId, data);
    }

    private async Task<IActionResult> WriteAsync(string action, int? featureId, JsonNode data)
    {
        var parameters = Key(action).AddParam("username", User.FindFirst(ClaimsTransformer.IdentifierClaim)?.Value ?? User.Identity?.Name);
        if (featureId.HasValue) parameters.AddParam("featureId", featureId.Value);
        var response = await commands.ExecuteAsync(parameters, data);
        if (response.IsOkay) store.Invalidate();
        return Feature(response);
    }

    // Matches requested roles to the catalog ignoring case and keeps the catalog's spelling.
    private async Task<List<string>> KnownRolesAsync(Payload payload, IEnumerable<string> requested)
    {
        var known = await roleCatalog.GetRoleNamesAsync();
        var resolved = new List<string>();
        foreach (var role in requested)
        {
            var match = known.FirstOrDefault(k => string.Equals(k, role, StringComparison.OrdinalIgnoreCase));
            if (match == null) payload.Errors.Add($"'{role}' is not a known role.");
            else if (!resolved.Contains(match)) resolved.Add(match);
        }
        return resolved;
    }

    private static IParameters Key(string action) => new Parameters().CommandQuery(FeatureSqlCommandInitializer.Name, action);

    private IActionResult Feature(Response<JsonNode> response)
    {
        if (!response.IsOkay) return Refused(response);
        var feature = response.Model?["feature"];
        return feature == null ? NotFound(new { message = "Feature not found." }) : Ok(feature);
    }

    private IActionResult Invalid(Payload payload) => BadRequest(new { message = string.Join(" ", payload.Errors) });

    private IActionResult Refused(Response response) =>
        StatusCode(response.Status.HttpCode, new { message = response.Status.Message });
}
