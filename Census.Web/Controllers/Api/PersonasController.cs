using System.Threading.Tasks;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// The persona UX's read of membership (personas.md §11): the members a "view as" can pick, and
// one member's features and application scope.
[ApiController]
[Route("api/personas")]
public class PersonasController(MemberAccess access) : ControllerBase
{
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
