using System.Threading.Tasks;
using Census.Web.FeatureAccess.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// The reset's API (census-on-apptrak.md §5). Unlike the other Administer APIs it does not let every
// request through until sign-in: the member viewed as must hold system-administrator on Census, the
// setting Reset:Allowed must be on, and the scripts refuse on a database not armed by hand.
[ApiController]
[Route("api/admin/reset")]
public class ResetController(AssertionReset reset) : ControllerBase
{
    public const string Word = "RESET";

    [HttpGet]
    public async Task<IActionResult> Status()
    {
        if (!reset.Enabled) return NotFound();
        return Ok(await reset.StatusAsync(Actor));
    }

    [HttpPost]
    public async Task<IActionResult> Reset([FromBody] ResetRequest request)
    {
        if (!reset.Enabled) return NotFound();
        var refused = await Refused();
        if (refused != null) return refused;
        if (request?.Confirm != Word) return BadRequest(new { errors = new[] { $"Type {Word} to confirm." } });
        if (string.IsNullOrWhiteSpace(request.Reason)) return BadRequest(new { errors = new[] { "A reset needs a reason." } });
        return Result(await reset.ResetAsync(request.Reason.Trim(), Actor));
    }

    [HttpPost("{id:int}/restore")]
    public async Task<IActionResult> Restore(int id)
    {
        if (!reset.Enabled) return NotFound();
        var refused = await Refused();
        if (refused != null) return refused;
        return Result(await reset.RestoreAsync(id, Actor));
    }

    private string Actor => User.Identity?.Name ?? (Request.Headers.TryGetValue(FeatureAccessController.ActorHeader, out var member) ? member.ToString() : "census");

    private async Task<IActionResult> Refused()
    {
        if (!reset.SettingAllows) return StatusCode(403, new { errors = new[] { "This Census is not allowed to reset: the setting Reset:Allowed is off." } });
        if (!await reset.IsAdminAsync(Actor)) return StatusCode(403, new { errors = new[] { "Only a system administrator on Census may reset." } });
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
