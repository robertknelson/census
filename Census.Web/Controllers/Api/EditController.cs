using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.Identity;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// The curate pages' API (personas.md §6.3): read every asserted row as stored; create, correct or
// delete any of them, in the applications of the member acted as (census-on-apptrak.md §7): reads are
// trimmed to them, and each write needs that kind of row's curate feature on its application (403
// otherwise), before and after. Each change is attributed to the member acted as, with the real user
// beside it when they differ (§10), and audited (moveit.EditAudit).
[ApiController]
[Route("api/edit")]
public class EditController(MoveItEdit edit, MoveItScope scope) : ControllerBase
{
    [HttpGet("{name}")]
    public async Task<IActionResult> Read(string name)
    {
        if (!edit.Enabled || !MoveItEdit.Reads.Contains(name)) return NotFound();
        return Ok(await (await scope.ForAsync(User)).TrimAsync($"edit.{name}", await edit.ReadAsync(name)));
    }

    [HttpGet("audit/release/{id:int}")]
    public async Task<IActionResult> ReleaseAudit(int id)
    {
        if (!edit.Enabled) return NotFound();
        var reader = await scope.ForAsync(User);
        if (!reader.All && !(await reader.ReleaseAppAsync(id) is int app && reader.Sees(app))) return NotFound();
        return Ok(await edit.ReleaseAuditAsync(id));
    }

    [HttpPost("release")]
    [HttpPost("release/{id:int}")]
    public async Task<IActionResult> SaveRelease(int? id, [FromBody] ReleaseEdit r) =>
        await Allowed(MoveItScope.Releases, r.ApplicationId, id is int i ? s => s.ReleaseAppAsync(i) : null)
        ?? await Save(await edit.ValidateAsync(r), () => edit.SaveAsync(id, r, Actor));

    [HttpPost("workitem")]
    [HttpPost("workitem/{id:int}")]
    public async Task<IActionResult> SaveWorkItem(int? id, [FromBody] WorkItemEdit r) =>
        await Allowed(MoveItScope.Items, r.ApplicationId, id is int i ? s => s.ItemAppAsync(i) : null)
        ?? (r.ReleaseId is int rel ? await AllowedRelease(MoveItScope.Items, rel) : null)
        ?? await Save(await edit.ValidateAsync(r), () => edit.SaveAsync(id, r, Actor));

    [HttpPost("build")]
    [HttpPost("build/{id:int}")]
    public async Task<IActionResult> SaveBuild(int? id, [FromBody] BuildEdit r) =>
        await AllowedRelease(MoveItScope.Associations, r.ReleaseId)
        ?? (id is int i ? await AllowedRow(MoveItScope.Associations, s => s.BuildAppAsync(i)) : null)
        ?? await Save(MoveItEdit.Validate(r), () => edit.SaveAsync(id, r, Actor));

    [HttpPost("event")]
    [HttpPost("event/{id:int}")]
    public async Task<IActionResult> SaveEvent(int? id, [FromBody] EventEdit r) =>
        await AllowedRelease(MoveItScope.Events, r.ReleaseId)
        ?? (id is int i ? await AllowedRow(MoveItScope.Events, s => s.EventAppAsync(i)) : null)
        ?? await Save(await edit.ValidateAsync(r), () => edit.SaveAsync(id, r, Actor));

    [HttpPost("link")]
    [HttpPost("link/{id:int}")]
    public async Task<IActionResult> SaveLink(int? id, [FromBody] LinkEdit r) =>
        await AllowedRow(MoveItScope.Items, s => s.ItemAppAsync(r.WorkItemId))
        ?? (id is int i ? await AllowedRow(MoveItScope.Items, s => s.LinkAppAsync(i)) : null)
        ?? await Save(await edit.ValidateAsync(r), () => edit.SaveAsync(id, r, Actor));

    [HttpPost("{entity}/{id:int}/delete")]
    public async Task<IActionResult> Delete(string entity, int id)
    {
        if (!edit.Enabled) return NotFound();
        if (entity is not ("release" or "workitem" or "build" or "event" or "link")) return NotFound();
        var refused = entity switch
        {
            "release" => await AllowedRow(MoveItScope.Releases, s => s.ReleaseAppAsync(id)),
            "workitem" => await AllowedRow(MoveItScope.Items, s => s.ItemAppAsync(id)),
            "build" => await AllowedRow(MoveItScope.Associations, s => s.BuildAppAsync(id)),
            "event" => await AllowedRow(MoveItScope.Events, s => s.EventAppAsync(id)),
            _ => await AllowedRow(MoveItScope.Items, s => s.LinkAppAsync(id)),
        };
        return refused ?? Result(await edit.DeleteAsync(entity, id, Actor));
    }

    private Actor Actor => User.Actor();

    // null when allowed: the feature on the application asked for, and on the row's own application when it exists.
    private async Task<IActionResult> Allowed(string feature, int applicationId, Func<MoveItScope.Reader, Task<int?>> current)
    {
        var reader = await scope.ForAsync(User);
        if (!reader.May(feature, applicationId)) return Forbidden(feature);
        if (current != null && await current(reader) is int app && !reader.May(feature, app)) return Forbidden(feature);
        return null;
    }

    private Task<IActionResult> AllowedRelease(string feature, int releaseId) => AllowedRow(feature, s => s.ReleaseAppAsync(releaseId));

    // A row that is gone, or not in the member's applications, is refused alike: no telling which. A row that is gone
    // and allowed would be the script's 404, so an estate-wide member still gets that.
    private async Task<IActionResult> AllowedRow(string feature, Func<MoveItScope.Reader, Task<int?>> app)
    {
        var reader = await scope.ForAsync(User);
        if (await app(reader) is int a) return reader.May(feature, a) ? null : Forbidden(feature);
        return reader.All ? null : Forbidden(feature);
    }

    private ObjectResult Forbidden(string feature) =>
        StatusCode(403, new { errors = new[] { $"You may not change this here: it needs {feature} on its application." } });

    private async Task<IActionResult> Save(List<string> errors, Func<Task<WriteResult>> write)
    {
        if (!edit.Enabled) return NotFound();
        if (errors.Count > 0) return BadRequest(new { errors });
        return Result(await write());
    }

    private IActionResult Result(WriteResult result) => result.Status switch
    {
        200 => Ok(new { key = result.Key }),
        404 => NotFound(new { errors = new[] { result.Message } }),
        _ => Conflict(new { errors = new[] { result.Message } }),
    };
}
