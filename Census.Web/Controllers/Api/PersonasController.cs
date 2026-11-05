using System.Threading.Tasks;
using Census.Web.Identity;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Census.Web.Controllers.Api;

// The persona UX's read of membership (personas.md §11): who is signed in and who they act as, with that member's
// features and application scope (census-on-apptrak.md §10); and, for a system administrator, the members View as can
// pick and any one member's access.
[ApiController]
[Route("api/personas")]
public class PersonasController(MemberAccess access, MoveItQuestions questions, MoveItScope scope, IOptions<ImpersonationOptions> impersonation) : ControllerBase
{
    // Everything the shell needs about the user, decided here: the access of the member acted as (null when the
    // signed-in user is not a member), whether Administer is offered, and whether View as is.
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        if (!access.Enabled) return NotFound();
        return Ok(new
        {
            identifier = User.Effective(),
            name = User.FindFirst(CensusClaims.Name)?.Value,
            canonical = new { identifier = User.Canonical(), name = User.FindFirst(CensusClaims.CanonicalName)?.Value },
            impersonating = User.IsImpersonating(),
            administer = User.CanAdminister(),
            canImpersonate = User.CanAdminister() && impersonation.Value.IsEnabled,
            access = await access.AccessAsync(User.Effective()),
        });
    }

    // The period view's "shipped" (personas.md §5): question 09's first arrival at PROD per
    // release, read verbatim. Here rather than on Move It's controller so that stays untouched.
    [HttpGet("lead-time")]
    public Task<IActionResult> LeadTime() => Run("question.09-lead-time");

    // The Needs you queue (personas.md §5.2): two Move It questions no Move It page reads yet.
    [HttpGet("order-violations")]
    public Task<IActionResult> OrderViolations() => Run("question.03-order-violations");

    [HttpGet("stage-mismatch")]
    public Task<IActionResult> StageMismatch() => Run("question.06-stage-mismatch");

    [HttpGet("members")]
    public async Task<IActionResult> Members()
    {
        if (!access.Enabled) return NotFound();
        if (!User.CanAdminister()) return StatusCode(403);
        return Ok(await access.MembersAsync());
    }

    [HttpGet("members/{identifier}")]
    public async Task<IActionResult> Member(string identifier)
    {
        if (!access.Enabled) return NotFound();
        if (!User.CanAdminister()) return StatusCode(403);
        var result = await access.AccessAsync(identifier);
        return result == null ? NotFound() : Ok(result);
    }

    private async Task<IActionResult> Run(string key)
    {
        if (!questions.Enabled) return NotFound();
        return Ok(await (await scope.ForAsync(User)).TrimAsync(key, await questions.RunAsync(key)));
    }
}
