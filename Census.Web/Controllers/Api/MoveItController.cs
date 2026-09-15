using System.Threading.Tasks;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// One endpoint per question (move-it.md §13); each runs its .sql file verbatim.
[ApiController]
[Route("api/moveit")]
public class MoveItController(MoveItQuestions questions) : ControllerBase
{
    [HttpGet("stages")]
    public Task<IActionResult> Stages() => Run("board/stages.sql");

    [HttpGet("applications")]
    public Task<IActionResult> Applications() => Run("board/applications.sql");

    [HttpGet("where-is-everything")]
    public Task<IActionResult> WhereIsEverything() => Run("questions/01-where-is-everything.sql");

    [HttpGet("release-status")]
    public Task<IActionResult> ReleaseStatus() => Run("questions/02-release-status.sql");

    [HttpGet("ready-to-approve")]
    public Task<IActionResult> ReadyToApprove() => Run("questions/04-ready-to-approve.sql");

    [HttpGet("approval-vs-prod")]
    public Task<IActionResult> ApprovalVsProd() => Run("questions/12-approval-vs-prod.sql");

    private async Task<IActionResult> Run(string file)
    {
        if (!questions.Enabled) return NotFound();
        return Ok(await questions.RunAsync(file));
    }
}
