using System.Threading.Tasks;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// One endpoint per question (move-it.md §13); each runs its .sql file verbatim. The one
// write (§15) runs the manifest statements with parameters, inside MoveItEntry.
[ApiController]
[Route("api/moveit")]
public class MoveItController(MoveItQuestions questions, MoveItEntry entry) : ControllerBase
{
    [HttpGet("stages")]
    public Task<IActionResult> Stages() => Run("board/stages.sql");

    [HttpGet("applications")]
    public Task<IActionResult> Applications() => Run("board/applications.sql");

    [HttpGet("releases")]
    public Task<IActionResult> Releases() => Run("board/releases.sql");

    [HttpGet("history")]
    public Task<IActionResult> History() => Run("board/history.sql");

    [HttpGet("lists")]
    public Task<IActionResult> Lists() => Run("manifest/lists.sql");

    [HttpGet("where-is-everything")]
    public Task<IActionResult> WhereIsEverything() => Run("questions/01-where-is-everything.sql");

    [HttpGet("release-status")]
    public Task<IActionResult> ReleaseStatus() => Run("questions/02-release-status.sql");

    [HttpGet("ready-to-approve")]
    public Task<IActionResult> ReadyToApprove() => Run("questions/04-ready-to-approve.sql");

    [HttpGet("approval-vs-prod")]
    public Task<IActionResult> ApprovalVsProd() => Run("questions/12-approval-vs-prod.sql");

    [HttpPost("name-build")]
    public async Task<IActionResult> NameBuild([FromBody] NameBuildRequest request)
    {
        if (!entry.Enabled) return NotFound();
        var errors = await entry.ValidateAsync(request);
        if (errors.Count > 0) return BadRequest(new { errors });
        return Ok(await entry.NameBuildAsync(request));
    }

    private async Task<IActionResult> Run(string file)
    {
        if (!questions.Enabled) return NotFound();
        return Ok(await questions.RunAsync(file));
    }
}
