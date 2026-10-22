using System.Threading.Tasks;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// The persona UX's read of membership (personas.md §11): the members a "view as" can pick, and
// one member's features and application scope.
[ApiController]
[Route("api/personas")]
public class PersonasController(MemberAccess access, MoveItQuestions questions) : ControllerBase
{
    // The period view's "shipped" (personas.md §5): question 09's first arrival at PROD per
    // release, read verbatim. Here rather than on Move It's controller so that stays untouched.
    [HttpGet("lead-time")]
    public Task<IActionResult> LeadTime() => Run("questions/09-lead-time.sql");

    // The Needs you queue (personas.md §5.2): two Move It questions no Move It page reads yet.
    [HttpGet("order-violations")]
    public Task<IActionResult> OrderViolations() => Run("questions/03-order-violations.sql");

    [HttpGet("stage-mismatch")]
    public Task<IActionResult> StageMismatch() => Run("questions/06-stage-mismatch.sql");

    [HttpGet("members")]
    public async Task<IActionResult> Members()
    {
        if (!access.Enabled) return NotFound();
        return Ok(await access.MembersAsync());
    }

    [HttpGet("members/{identifier}")]
    public async Task<IActionResult> Member(string identifier)
    {
        if (!access.Enabled) return NotFound();
        var result = await access.AccessAsync(identifier);
        return result == null ? NotFound() : Ok(result);
    }

    private async Task<IActionResult> Run(string file)
    {
        if (!questions.Enabled) return NotFound();
        return Ok(await questions.RunAsync(file));
    }
}
