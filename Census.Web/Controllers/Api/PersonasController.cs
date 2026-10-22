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
    public async Task<IActionResult> LeadTime()
    {
        if (!questions.Enabled) return NotFound();
        return Ok(await questions.RunAsync("questions/09-lead-time.sql"));
    }

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
}
