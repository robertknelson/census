using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.Identity;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// The curate pages' API (personas.md §6.3): read every asserted row as stored; create, correct or
// delete any of them. Any signed-in user until scoped ownership (census-on-apptrak.md §7, O-1) trims
// it to the applications they own; each change is attributed to the member acted as, with the real
// user beside it when they differ (§10), and audited (moveit.EditAudit).
[ApiController]
[Route("api/edit")]
public class EditController(MoveItEdit edit) : ControllerBase
{
    [HttpGet("{name}")]
    public async Task<IActionResult> Read(string name)
    {
        if (!edit.Enabled || !MoveItEdit.Reads.Contains(name)) return NotFound();
        return Ok(await edit.ReadAsync(name));
    }

    [HttpGet("audit/release/{id:int}")]
    public async Task<IActionResult> ReleaseAudit(int id)
    {
        if (!edit.Enabled) return NotFound();
        return Ok(await edit.ReleaseAuditAsync(id));
    }

    [HttpPost("release")]
    [HttpPost("release/{id:int}")]
    public async Task<IActionResult> SaveRelease(int? id, [FromBody] ReleaseEdit r) => await Save(await edit.ValidateAsync(r), () => edit.SaveAsync(id, r, Actor));

    [HttpPost("workitem")]
    [HttpPost("workitem/{id:int}")]
    public async Task<IActionResult> SaveWorkItem(int? id, [FromBody] WorkItemEdit r) => await Save(await edit.ValidateAsync(r), () => edit.SaveAsync(id, r, Actor));

    [HttpPost("build")]
    [HttpPost("build/{id:int}")]
    public async Task<IActionResult> SaveBuild(int? id, [FromBody] BuildEdit r) => await Save(MoveItEdit.Validate(r), () => edit.SaveAsync(id, r, Actor));

    [HttpPost("event")]
    [HttpPost("event/{id:int}")]
    public async Task<IActionResult> SaveEvent(int? id, [FromBody] EventEdit r) => await Save(await edit.ValidateAsync(r), () => edit.SaveAsync(id, r, Actor));

    [HttpPost("link")]
    [HttpPost("link/{id:int}")]
    public async Task<IActionResult> SaveLink(int? id, [FromBody] LinkEdit r) => await Save(await edit.ValidateAsync(r), () => edit.SaveAsync(id, r, Actor));

    [HttpPost("{entity}/{id:int}/delete")]
    public async Task<IActionResult> Delete(string entity, int id)
    {
        if (!edit.Enabled) return NotFound();
        if (entity is not ("release" or "workitem" or "build" or "event" or "link")) return NotFound();
        return Result(await edit.DeleteAsync(entity, id, Actor));
    }

    private Actor Actor => User.Actor();

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
