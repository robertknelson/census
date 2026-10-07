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

    [HttpGet("events")]
    public Task<IActionResult> Events() => Run("board/events.sql");

    [HttpGet("release-builds")]
    public Task<IActionResult> ReleaseBuilds() => Run("board/release-builds.sql");

    [HttpGet("coverage")]
    public Task<IActionResult> Coverage() => Run("board/coverage.sql");

    [HttpGet("calendar")]
    public Task<IActionResult> Calendar() => Run("board/calendar.sql");

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

    // The feature picture (§28): one document, every item, served whole; the register indexes it.
    [HttpGet("feature-picture")]
    public async Task<IActionResult> FeaturePicture()
    {
        if (!questions.Enabled) return NotFound();
        return Content(await questions.RunJsonAsync("questions/13-feature-picture.sql"), "application/json");
    }

    [HttpPost("name-build")]
    public async Task<IActionResult> NameBuild([FromBody] NameBuildRequest request)
    {
        if (!entry.Enabled) return NotFound();
        var errors = await entry.ValidateAsync(request);
        if (errors.Count > 0) return BadRequest(new { errors });
        return Ok(await entry.NameBuildAsync(request));
    }

    // The notebook (§20): the board's one write.
    [HttpPost("add-item")]
    public async Task<IActionResult> AddItem([FromBody] AddItemRequest request)
    {
        if (!entry.Enabled) return NotFound();
        var errors = await entry.ValidateAddItemAsync(request);
        if (errors.Count > 0) return BadRequest(new { errors });
        return Ok(await entry.AddItemAsync(request));
    }

    [HttpPost("event")]
    public async Task<IActionResult> RecordEvent([FromBody] EventRequest request)
    {
        if (!entry.Enabled) return NotFound();
        var errors = await entry.ValidateEventAsync(request);
        if (errors.Count > 0) return BadRequest(new { errors });
        return Ok(new { outcome = await entry.RecordEventAsync(request) });
    }

    [HttpPost("pull-item")]
    public async Task<IActionResult> PullItem([FromBody] ItemRequest request)
    {
        if (!entry.Enabled) return NotFound();
        if (request.WorkItemId <= 0) return BadRequest(new { errors = new[] { "An item is required." } });
        return Ok(new { outcome = await entry.PullItemAsync(request) });
    }

    [HttpPost("retitle")]
    public async Task<IActionResult> Retitle([FromBody] ItemRequest request)
    {
        if (!entry.Enabled) return NotFound();
        if (request.WorkItemId <= 0 || string.IsNullOrWhiteSpace(request.Title)) return BadRequest(new { errors = new[] { "An item and a title are required." } });
        return Ok(new { outcome = await entry.RetitleAsync(request) });
    }

    [HttpPost("delete-release")]
    public async Task<IActionResult> DeleteRelease([FromBody] ReleaseRequest request)
    {
        if (!entry.Enabled) return NotFound();
        if (request.ReleaseId <= 0) return BadRequest(new { errors = new[] { "A release is required." } });
        return Ok(await entry.DeleteReleaseAsync(request.ReleaseId));
    }

    private async Task<IActionResult> Run(string file)
    {
        if (!questions.Enabled) return NotFound();
        return Ok(await questions.RunAsync(file));
    }
}
