using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Census.Web.Identity;
using Census.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// The membership page's API (personas.md §6.2). Offered only to a system administrator on Census in
// the persona UX, and refused (403) to anyone else here: the signed-in user's own role, which carries
// through impersonation (census-on-apptrak.md §10). A change is attributed to the member acted as,
// with the real user beside it when they differ.
[ApiController]
[Authorize(Policy = CensusClaims.AdministerPolicy)]
[Route("api/membership")]
public class MembershipController(MembershipAdmin membership) : ControllerBase
{
    [HttpGet("applications")]
    public Task<IActionResult> Applications() => Read(membership.ApplicationsAsync);

    [HttpGet("members")]
    public Task<IActionResult> Members() => Read(membership.MembersAsync);

    [HttpGet("lists")]
    public Task<IActionResult> Lists() => Read(membership.ListsAsync);

    [HttpGet("app-parts")]
    public Task<IActionResult> AppParts() => Read(membership.AppPartsAsync);

    [HttpGet("audit/recent")]
    public Task<IActionResult> RecentAudit() => Read(membership.RecentAuditAsync);

    [HttpGet("audit/{entity}/{id:int}")]
    public async Task<IActionResult> Audit(string entity, int id)
    {
        if (!membership.Enabled) return NotFound();
        if (entity is not ("application" or "member")) return NotFound();
        return Ok(await membership.AuditAsync(entity, id));
    }

    [HttpPost("applications")]
    public Task<IActionResult> CreateApplication([FromBody] ApplicationSave request) => SaveApplication(null, request);

    [HttpPost("applications/{id:int}")]
    public Task<IActionResult> UpdateApplication(int id, [FromBody] ApplicationSave request) => SaveApplication(id, request);

    [HttpPost("members")]
    public Task<IActionResult> CreateMember([FromBody] MemberSave request) => SaveMember(null, request);

    [HttpPost("members/{id:int}")]
    public Task<IActionResult> UpdateMember(int id, [FromBody] MemberSave request) => SaveMember(id, request);

    [HttpPost("applications/{id:int}/delete")]
    public async Task<IActionResult> DeleteApplication(int id)
    {
        if (!membership.Enabled) return NotFound();
        return Result(await membership.DeleteApplicationAsync(id, Actor));
    }

    [HttpPost("members/{id:int}/delete")]
    public async Task<IActionResult> DeleteMember(int id)
    {
        if (!membership.Enabled) return NotFound();
        return Result(await membership.DeleteMemberAsync(id, Actor));
    }

    [HttpPost("parts/save")]
    public async Task<IActionResult> SavePart([FromBody] AppPartSave request)
    {
        if (!membership.Enabled) return NotFound();
        var errors = MembershipAdmin.Validate(request);
        if (errors.Count > 0) return BadRequest(new { errors });
        return Result(await membership.SavePartAsync(request, Actor));
    }

    [HttpPost("parts/delete")]
    public async Task<IActionResult> DeletePart([FromBody] AppPartSave request)
    {
        if (!membership.Enabled) return NotFound();
        if (request.Part is not ("role" or "stage" or "service") || request.OldKey is null) return BadRequest(new { errors = new[] { "Say which part to remove." } });
        return Result(await membership.DeletePartAsync(request, Actor));
    }

    [HttpPost("grants/grant")]
    public Task<IActionResult> Grant([FromBody] GrantSave request) => SaveGrant(request, revoke: false);

    [HttpPost("grants/revoke")]
    public Task<IActionResult> Revoke([FromBody] GrantSave request) => SaveGrant(request, revoke: true);

    private Actor Actor => User.Actor();

    private async Task<IActionResult> Read(Func<Task<List<Dictionary<string, object>>>> read)
    {
        if (!membership.Enabled) return NotFound();
        return Ok(await read());
    }

    private async Task<IActionResult> SaveApplication(int? id, ApplicationSave request)
    {
        if (!membership.Enabled) return NotFound();
        var errors = MembershipAdmin.Validate(request);
        if (errors.Count > 0) return BadRequest(new { errors });
        return Result(await membership.SaveApplicationAsync(id, request, Actor));
    }

    private async Task<IActionResult> SaveMember(int? id, MemberSave request)
    {
        if (!membership.Enabled) return NotFound();
        var errors = MembershipAdmin.Validate(request);
        if (errors.Count > 0) return BadRequest(new { errors });
        return Result(await membership.SaveMemberAsync(id, request, Actor));
    }

    private async Task<IActionResult> SaveGrant(GrantSave request, bool revoke)
    {
        if (!membership.Enabled) return NotFound();
        if (request.MemberId <= 0 || request.ApplicationId <= 0 || request.RoleId <= 0) return BadRequest(new { errors = new[] { "A member, an application and a role are required." } });
        return Result(await membership.SaveGrantAsync(request, revoke, Actor));
    }

    private IActionResult Result(WriteResult result) => result.Status switch
    {
        200 => Ok(new { key = result.Key }),
        404 => NotFound(new { errors = new[] { result.Message } }),
        _ => Conflict(new { errors = new[] { result.Message } }),
    };
}
