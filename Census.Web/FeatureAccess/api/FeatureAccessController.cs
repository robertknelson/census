using Census.Web.FeatureAccess.Data;
using Census.Web.FeatureAccess.Evaluation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace Census.Web.FeatureAccess.Api
{
    [ApiController]
    [Route("api/feature-access")]
    [Authorize(Policy = FeatureAccessPolicies.Admin)]
    public class FeatureAccessController : ControllerBase
    {
        private readonly FeatureCommandHandler _commands;
        private readonly FeatureQueryHandler _queries;
        private readonly IRoleCatalog _roleCatalog;
        private readonly FeatureGateScanner _scanner;

        public FeatureAccessController(
            FeatureCommandHandler commands,
            FeatureQueryHandler queries,
            IRoleCatalog roleCatalog,
            FeatureGateScanner scanner)
        {
            _commands = commands;
            _queries = queries;
            _roleCatalog = roleCatalog;
            _scanner = scanner;
        }

        [HttpGet("features")]
        public async Task<IActionResult> List(bool includeVoided = false) =>
            ToResult(await _queries.QueryAsync(FeatureKeys.List, includeVoided: includeVoided));

        [HttpGet("features/{featureId:int}")]
        public async Task<IActionResult> Get(int featureId) =>
            ToResult(await _queries.QueryAsync(FeatureKeys.Get, featureId));

        [HttpGet("features/{featureId:int}/audit")]
        public async Task<IActionResult> Audit(int featureId) =>
            ToResult(await _queries.QueryAsync(FeatureKeys.Audit, featureId));

        [HttpGet("roles")]
        public async Task<IActionResult> Roles() => Ok(await _roleCatalog.GetRoleNamesAsync());

        [HttpGet("gate-scan")]
        public async Task<IActionResult> GateScan() => Ok(await _scanner.ScanAsync());

        [HttpPost("features")]
        public async Task<IActionResult> Create([FromBody] JsonNode data) =>
            ToResult(await _commands.ExecuteAsync(FeatureKeys.Create, Actor, null, data));

        [HttpPost("features/{featureId:int}/update")]
        public async Task<IActionResult> Update(int featureId, [FromBody] JsonNode data) =>
            ToResult(await _commands.ExecuteAsync(FeatureKeys.Update, Actor, featureId, data));

        [HttpPost("features/{featureId:int}/set-enabled")]
        public async Task<IActionResult> SetEnabled(int featureId, [FromBody] JsonNode data) =>
            ToResult(await _commands.ExecuteAsync(FeatureKeys.SetEnabled, Actor, featureId, data));

        // Void is not exposed (D13): retiring a feature name is a development change, shipped as a migration with the
        // commit that removes its [FeatureGate]. The handler, key and feature-void.sql remain as that migration's template.

        [HttpPost("features/{featureId:int}/roles/grant")]
        public async Task<IActionResult> GrantRole(int featureId, [FromBody] JsonNode data) =>
            ToResult(await _commands.ExecuteAsync(FeatureKeys.RoleGrant, Actor, featureId, data));

        [HttpPost("features/{featureId:int}/roles/revoke")]
        public async Task<IActionResult> RevokeRole(int featureId, [FromBody] JsonNode data) =>
            ToResult(await _commands.ExecuteAsync(FeatureKeys.RoleRevoke, Actor, featureId, data));

        // Census has no sign-in yet: the persona UX sends the member it is viewing as.
        private string Actor => User.Identity?.Name ?? (Request.Headers.TryGetValue(ActorHeader, out var member) ? member.ToString() : "census");

        public const string ActorHeader = "X-Census-Member";

        private IActionResult ToResult(FeatureResponse response) => response.Status switch
        {
            FeatureResponseStatus.Ok => Ok(response.Data),
            FeatureResponseStatus.Invalid => BadRequest(new { message = response.Message }),
            FeatureResponseStatus.NotFound => NotFound(new { message = response.Message }),
            _ => Conflict(new { message = response.Message })
        };
    }
}
