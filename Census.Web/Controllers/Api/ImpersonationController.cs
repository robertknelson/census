using System;
using System.Threading.Tasks;
using Census.Web.Identity;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Census.Web.Controllers.Api;

// Impersonation (census-on-apptrak.md §10, D-005), xf-dashboard's §9 in Census's form. Start: a system administrator
// (the real user, not the one acted as), with Impersonation:IsEnabled on, names a member. Stop: authorized on the real
// user and never gated by the switch, so it cannot strand anyone. Both are logged with both identities and the session
// (their Finding 2).
[ApiController]
[Route("api/impersonation")]
public class ImpersonationController(
    ImpersonationStore store,
    MemberAccess members,
    IOptions<ImpersonationOptions> options,
    ILogger<ImpersonationController> logger) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Start([FromBody] ImpersonationRequest request)
    {
        if (!options.Value.IsEnabled) return StatusCode(403, new { errors = new[] { "Impersonation is turned off here (Impersonation:IsEnabled)." } });
        if (!User.CanAdminister()) return StatusCode(403, new { errors = new[] { "Only a system administrator may act as someone else." } });
        var identifier = request?.Identifier?.Trim();
        if (string.IsNullOrEmpty(identifier)) return BadRequest(new { errors = new[] { "Name the member to act as." } });
        if (string.Equals(identifier, User.Canonical(), StringComparison.OrdinalIgnoreCase)) return BadRequest(new { errors = new[] { "You cannot impersonate yourself; stop instead." } });
        var target = await members.AccessAsync(identifier);
        if (target == null) return NotFound(new { errors = new[] { $"No member '{identifier}'." } });

        store.Set(User.Canonical(), new ImpersonationTarget(target.Member.Identifier, target.Member.Name, DateTimeOffset.Now));
        logger.LogInformation("Impersonation started: '{Canonical}' is acting as '{Effective}' (session {Session}, was acting as '{Before}').",
            User.Canonical(), target.Member.Identifier, User.SessionId(), User.Effective());
        return Ok(new { effective = target.Member.Identifier });
    }

    [HttpPost("stop")]
    public IActionResult Stop()
    {
        if (!User.CanAdminister()) return StatusCode(403, new { errors = new[] { "Only a system administrator impersonates." } });
        var was = User.Effective();
        store.Clear(User.Canonical());
        if (User.IsImpersonating())
        {
            logger.LogInformation("Impersonation stopped: '{Canonical}' is no longer acting as '{Effective}' (session {Session}).",
                User.Canonical(), was, User.SessionId());
        }
        return Ok(new { effective = User.Canonical() });
    }
}

public class ImpersonationRequest
{
    public string Identifier { get; init; }
}
