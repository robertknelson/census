using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Census.Web.FeatureAccess.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// The membership page's API (personas.md §6.2). Like feature access, it is offered only to a Sys
// Admin in the persona UX and lets every request through until Census has sign-in (P12); the
// change is attributed to the member viewed as.
[ApiController]
[Route("api/membership")]
public class MembershipController(MembershipAdmin membership) : ControllerBase
{
    [HttpGet("applications")]
    public Task<IActionResult> Applications() => Read(membership.ApplicationsAsync);

    [HttpGet("members")]
    public Task<IActionResult> Members() => Read(membership.MembersAsync);

    [HttpGet("lists")]
    public Task<IActionResult> Lists() => Read(membership.ListsAsync);

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

    [HttpPost("grants/grant")]
    public Task<IActionResult> Grant([FromBody] GrantSave request) => SaveGrant(request, revoke: false);

    [HttpPost("grants/revoke")]
    public Task<IActionResult> Revoke([FromBody] GrantSave request) => SaveGrant(request, revoke: true);

    private string Actor => User.Identity?.Name ?? (Request.Headers.TryGetValue(FeatureAccessController.ActorHeader, out var member) ? member.ToString() : "census");

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
