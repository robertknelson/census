using System.Threading.Tasks;
using Census.Web.Identity;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// The reset's API (census-on-apptrak.md §5): the signed-in user must be a system administrator on
// Census (carried through impersonation, §10), the setting Reset:Allowed must be on, and the scripts
// refuse on a database not armed by hand.
[ApiController]
[Route("api/admin/reset")]
public class ResetController(AssertionReset reset) : ControllerBase
{
    public const string Word = "RESET";

    [HttpGet]
    public async Task<IActionResult> Status()
    {
        if (!reset.Enabled) return NotFound();
        return Ok(await reset.StatusAsync(User.CanAdminister()));
    }

    [HttpPost]
    public async Task<IActionResult> Reset([FromBody] ResetRequest request)
    {
        if (!reset.Enabled) return NotFound();
        var refused = Refused();
        if (refused != null) return refused;
        if (request?.Confirm != Word) return BadRequest(new { errors = new[] { $"Type {Word} to confirm." } });
        if (string.IsNullOrWhiteSpace(request.Reason)) return BadRequest(new { errors = new[] { "A reset needs a reason." } });
        return Result(await reset.ResetAsync(request.Reason.Trim(), Actor));
    }

    [HttpPost("{id:int}/restore")]
    public async Task<IActionResult> Restore(int id)
    {
        if (!reset.Enabled) return NotFound();
        var refused = Refused();
        if (refused != null) return refused;
        return Result(await reset.RestoreAsync(id, Actor));
    }

    private Actor Actor => User.Actor();

    private IActionResult Refused()
    {
        if (!reset.SettingAllows) return StatusCode(403, new { errors = new[] { "This Census is not allowed to reset: the setting Reset:Allowed is off." } });
        if (!User.CanAdminister()) return StatusCode(403, new { errors = new[] { "Only a system administrator on Census may reset." } });
        return null;
    }

    private IActionResult Result(WriteResult result) => result.Status switch
    {
        200 => Ok(new { key = result.Key }),
        400 => BadRequest(new { errors = new[] { result.Message } }),
        404 => NotFound(new { errors = new[] { result.Message } }),
        _ => Conflict(new { errors = new[] { result.Message } }),
    };
}
