using System.Threading.Tasks;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// One endpoint per question (move-it.md §13); each runs its .sql file verbatim, trimmed to the applications the member
// acted as sees (census-on-apptrak.md §7). The writes (§15) run the manifest statements with parameters, inside
// MoveItEntry, each refused (403) unless the member holds that write's curate feature on its application.
[ApiController]
[Route("api/moveit")]
public class MoveItController(MoveItQuestions questions, MoveItEntry entry, MoveItScope scope) : ControllerBase
{
    // Where the member acted as may write, per curate feature ("all", or application ids): what the pages offer.
    [HttpGet("writes")]
    public async Task<IActionResult> Writes()
    {
        if (!questions.Enabled) return NotFound();
        return Ok((await scope.ForAsync(User)).Writes());
    }

    [HttpGet("stages")]
    public Task<IActionResult> Stages() => Run("board.stages");

    [HttpGet("applications")]
    public Task<IActionResult> Applications() => Run("board.applications");

    [HttpGet("releases")]
    public Task<IActionResult> Releases() => Run("board.releases");

    [HttpGet("history")]
    public Task<IActionResult> History() => Run("board.history");

    [HttpGet("events")]
    public Task<IActionResult> Events() => Run("board.events");

    [HttpGet("release-builds")]
    public Task<IActionResult> ReleaseBuilds() => Run("board.release-builds");

    // The release page's build claims (move-it.md §29).
    [HttpGet("release-build-history")]
    public Task<IActionResult> ReleaseBuildHistory() => Run("board.release-build-history");

    [HttpGet("builds-seen")]
    public Task<IActionResult> BuildsSeen() => Run("board.builds-seen");

    [HttpGet("coverage")]
    public Task<IActionResult> Coverage() => Run("board.coverage");

    [HttpGet("calendar")]
    public Task<IActionResult> Calendar() => Run("board.calendar");

    [HttpGet("lists")]
    public Task<IActionResult> Lists() => Run("moveit.lists");

    [HttpGet("where-is-everything")]
    public Task<IActionResult> WhereIsEverything() => Run("question.01-where-is-everything");

    [HttpGet("release-status")]
    public Task<IActionResult> ReleaseStatus() => Run("question.02-release-status");

    [HttpGet("ready-to-approve")]
    public Task<IActionResult> ReadyToApprove() => Run("question.04-ready-to-approve");

    [HttpGet("approval-vs-prod")]
    public Task<IActionResult> ApprovalVsProd() => Run("question.12-approval-vs-prod");

    // The feature picture (§28): one document, every item, served whole; the register indexes it.
    [HttpGet("feature-picture")]
    public async Task<IActionResult> FeaturePicture()
    {
        if (!questions.Enabled) return NotFound();
        var reader = await scope.ForAsync(User);
        return Content(reader.TrimPicture(await questions.RunJsonAsync("question.13-feature-picture")), "application/json");
    }

    [HttpPost("name-build")]
    public async Task<IActionResult> NameBuild([FromBody] NameBuildRequest request)
    {
        if (!entry.Enabled) return NotFound();
        if (await Refused(MoveItScope.Releases, request.ApplicationId) is { } refused) return refused;
        var errors = await entry.ValidateAsync(request);
        if (errors.Count > 0) return BadRequest(new { errors });
        return Ok(await entry.NameBuildAsync(request));
    }

    // The notebook (§20): the board's one write.
    [HttpPost("add-item")]
    public async Task<IActionResult> AddItem([FromBody] AddItemRequest request)
    {
        if (!entry.Enabled) return NotFound();
        if (await Refused(MoveItScope.Items, request.ApplicationId) is { } refused) return refused;
        var errors = await entry.ValidateAddItemAsync(request);
        if (errors.Count > 0) return BadRequest(new { errors });
        return Ok(await entry.AddItemAsync(request));
    }

    [HttpPost("event")]
    public async Task<IActionResult> RecordEvent([FromBody] EventRequest request)
    {
        if (!entry.Enabled) return NotFound();
        if (await RefusedRelease(MoveItScope.Events, request.ReleaseId) is { } refused) return refused;
        var errors = await entry.ValidateEventAsync(request);
        if (errors.Count > 0) return BadRequest(new { errors });
        return Ok(new { outcome = await entry.RecordEventAsync(request) });
    }

    [HttpPost("pull-item")]
    public async Task<IActionResult> PullItem([FromBody] ItemRequest request)
    {
        if (!entry.Enabled) return NotFound();
        if (request.WorkItemId <= 0) return BadRequest(new { errors = new[] { "An item is required." } });
        if (await RefusedItem(request.WorkItemId) is { } refused) return refused;
        return Ok(new { outcome = await entry.PullItemAsync(request) });
    }

    [HttpPost("retitle")]
    public async Task<IActionResult> Retitle([FromBody] ItemRequest request)
    {
        if (!entry.Enabled) return NotFound();
        if (request.WorkItemId <= 0 || string.IsNullOrWhiteSpace(request.Title)) return BadRequest(new { errors = new[] { "An item and a title are required." } });
        if (await RefusedItem(request.WorkItemId) is { } refused) return refused;
        return Ok(new { outcome = await entry.RetitleAsync(request) });
    }

    [HttpPost("claim-build")]
    public async Task<IActionResult> ClaimBuild([FromBody] BuildClaimRequest request)
    {
        if (!entry.Enabled) return NotFound();
        var errors = entry.ValidateBuildClaim(request, needsBy: false, needsTo: false);
        if (errors.Count > 0) return BadRequest(new { errors });
        if (await RefusedRelease(MoveItScope.Associations, request.ReleaseId) is { } refused) return refused;
        return Ok(new { outcome = await entry.ClaimBuildAsync(request) });
    }

    [HttpPost("release-build")]
    public async Task<IActionResult> ReleaseBuild([FromBody] BuildClaimRequest request)
    {
        if (!entry.Enabled) return NotFound();
        var errors = entry.ValidateBuildClaim(request, needsBy: true, needsTo: false);
        if (errors.Count > 0) return BadRequest(new { errors });
        if (await RefusedRelease(MoveItScope.Associations, request.ReleaseId) is { } refused) return refused;
        return Ok(new { outcome = await entry.ReleaseBuildAsync(request) });
    }

    [HttpPost("move-build")]
    public async Task<IActionResult> MoveBuild([FromBody] BuildClaimRequest request)
    {
        if (!entry.Enabled) return NotFound();
        var errors = entry.ValidateBuildClaim(request, needsBy: true, needsTo: true);
        if (errors.Count > 0) return BadRequest(new { errors });
        if (await RefusedRelease(MoveItScope.Associations, request.ReleaseId) is { } from) return from;
        if (await RefusedRelease(MoveItScope.Associations, request.ToReleaseId) is { } to) return to;
        return Ok(new { outcome = await entry.MoveBuildAsync(request) });
    }

    [HttpPost("delete-release")]
    public async Task<IActionResult> DeleteRelease([FromBody] ReleaseRequest request)
    {
        if (!entry.Enabled) return NotFound();
        if (request.ReleaseId <= 0) return BadRequest(new { errors = new[] { "A release is required." } });
        if (await RefusedRelease(MoveItScope.Releases, request.ReleaseId) is { } refused) return refused;
        return Ok(await entry.DeleteReleaseAsync(request.ReleaseId));
    }

    private async Task<IActionResult> Run(string key)
    {
        if (!questions.Enabled) return NotFound();
        var reader = await scope.ForAsync(User);
        return Ok(await reader.TrimAsync(key, await questions.RunAsync(key)));
    }

    // 403 with the reason unless the member acted as holds the feature on the application.
    private async Task<IActionResult> Refused(string feature, int applicationId) =>
        (await scope.ForAsync(User)).May(feature, applicationId) ? null : Forbidden(feature);

    // A release or an item that is gone, or not in the member's applications, is refused the same way: no telling which.
    // Someone who sees everything gets the script's own answer for one that is gone, as before.
    private async Task<IActionResult> RefusedRelease(string feature, int releaseId)
    {
        var reader = await scope.ForAsync(User);
        if (await reader.ReleaseAppAsync(releaseId) is int app) return reader.May(feature, app) ? null : Forbidden(feature);
        return reader.All ? null : Forbidden(feature);
    }

    private async Task<IActionResult> RefusedItem(int itemId)
    {
        var reader = await scope.ForAsync(User);
        if (await reader.ItemAppAsync(itemId) is int app) return reader.May(MoveItScope.Items, app) ? null : Forbidden(MoveItScope.Items);
        return reader.All ? null : Forbidden(MoveItScope.Items);
    }

    private ObjectResult Forbidden(string feature) =>
        StatusCode(403, new { errors = new[] { $"You may not change this here: it needs {feature} on its application." } });
}
