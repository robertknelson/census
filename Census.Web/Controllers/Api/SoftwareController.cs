using Census.Web.Models.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

/// <summary>
/// The fleet pivoted by application instead of machine: "which machines have X, and what
/// versions?" — one aggregation over every machine's latest snapshot.
/// </summary>
[ApiController]
[Route("api/software")]
public class SoftwareController(CensusStore censusStore) : ControllerBase
{
    [HttpGet]
    public ActionResult<SoftwareInventoryDto> GetSoftware()
    {
        var occurrences = new List<(string Name, string? Publisher, string Version, string Machine)>();

        foreach (var machine in censusStore.GetMachineDirs())
        {
            var envelope = censusStore.GetLatestSnapshot(machine);
            foreach (var app in envelope?.Apps?.Data?.Entries ?? [])
            {
                if (string.IsNullOrWhiteSpace(app.DisplayName)) continue;
                occurrences.Add((app.DisplayName, app.Publisher, app.DisplayVersion ?? "(no version)", machine));
            }
        }

        var items = occurrences
            .GroupBy(o => o.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => new SoftwareItemDto
            {
                Name = g.First().Name,
                Publisher = g.Select(o => o.Publisher).FirstOrDefault(p => !string.IsNullOrWhiteSpace(p)),
                MachineCount = g.Select(o => o.Machine).Distinct(StringComparer.OrdinalIgnoreCase).Count(),
                Versions = g
                    .GroupBy(o => o.Version, StringComparer.OrdinalIgnoreCase)
                    .Select(v => new SoftwareVersionDto
                    {
                        Version = v.Key,
                        Machines = v.Select(o => o.Machine).Distinct(StringComparer.OrdinalIgnoreCase)
                            .OrderBy(m => m, StringComparer.OrdinalIgnoreCase).ToList(),
                    })
                    .OrderByDescending(v => v.Machines.Count)
                    .ThenBy(v => v.Version, StringComparer.OrdinalIgnoreCase)
                    .ToList(),
            })
            .OrderBy(i => i.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Ok(new SoftwareInventoryDto { Items = items });
    }
}
