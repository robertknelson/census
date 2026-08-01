using Census.Web.Models.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/compare")]
public class CompareController(CensusStore censusStore) : ControllerBase
{
    [HttpGet]
    public ActionResult<CompareResultDto> GetCompare([FromQuery] string machines, [FromQuery] string? aspects)
    {
        var machineList = (machines ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();
        if (machineList.Count < 2) return BadRequest("Pass at least two machines, comma-separated.");

        var aspectList = string.IsNullOrWhiteSpace(aspects)
            ? CompareEngine.AllAspects.ToList()
            : aspects.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(a => CompareEngine.AllAspects.Contains(a))
                .ToList();
        if (aspectList.Count == 0) return BadRequest($"No valid aspects. Valid: {string.Join(", ", CompareEngine.AllAspects)}");

        var envelopes = machineList.Select(censusStore.GetLatestSnapshot).ToList();
        return Ok(CompareEngine.Compute(machineList, envelopes, aspectList));
    }
}
