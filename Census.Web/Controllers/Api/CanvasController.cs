using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/canvas")]
public class CanvasController(CensusStore censusStore, AssetsStore assetsStore, FindingsEngine findingsEngine) : ControllerBase
{
    public const string UnassignedOwner = "Unassigned";

    [HttpGet("dates")]
    public ActionResult<List<string>> GetDates() =>
        Ok(censusStore.GetFleetDates().Select(d => d.ToString("yyyy-MM-dd")).ToList());

    [HttpGet]
    public ActionResult<CanvasDto> GetCanvas([FromQuery] string? asOf)
    {
        DateOnly? asOfDate = null;
        if (asOf is not null)
        {
            if (!DateOnly.TryParseExact(asOf, "yyyy-MM-dd", out var parsed)) return BadRequest("asOf must be yyyy-MM-dd");
            asOfDate = parsed;
        }

        var assets = assetsStore.Load();
        var findingsByMachine = findingsEngine.Compute(asOfDate).Findings
            .GroupBy(f => f.Machine, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        // The canvas shows the whole known universe: collected machines, configured-but-
        // never-collected machines (ghost tiles), and dangling assertions (also ghosts) —
        // absence is signal, so nothing silently drops off the map.
        var universe = censusStore.GetMachineDirs()
            .Concat(censusStore.GetMachinesConfig().Names)
            .Concat(assets.Assets.Keys)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(m => m, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var machines = new List<CanvasMachineDto>();
        foreach (var machine in universe)
        {
            var envelope = asOfDate is { } day ? censusStore.GetSnapshotAsOf(machine, day) : censusStore.GetLatestSnapshot(machine);
            var entry = assets.Assets.GetValueOrDefault(machine);
            var facets = assetsStore.FacetsFor(assets, machine);
            var owners = assetsStore.OwnershipValuesFor(assets, machine);
            var findings = findingsByMachine.GetValueOrDefault(machine, []);
            var observedRoles = envelope?.Roles ?? [];
            var (resolvedClass, classSource) = MachineClassifier.Resolve(entry?.Class, observedRoles);

            machines.Add(new CanvasMachineDto
            {
                Machine = machine,
                Class = resolvedClass,
                ClassSource = classSource,
                ObservedRoles = observedRoles,
                Stages = facets.GetValueOrDefault("stage", []),
                Owners = owners.Count > 0 ? owners : [UnassignedOwner],
                Facets = facets,
                Posture = findings.Any(f => f.Severity.Equals("critical", StringComparison.OrdinalIgnoreCase)) ? "red"
                    : findings.Count > 0 ? "degraded"
                    : "ok",
                FindingCount = findings.Count,
                Findings = findings,
                HasData = envelope is not null,
                OsProductName = envelope?.Os?.Data?.ProductName,
                LatestDate = (asOfDate is { } d2 ? censusStore.GetSnapshotRefAsOf(machine, d2) : censusStore.GetSnapshotRefs(machine).LastOrDefault())?.Date.ToString("yyyy-MM-dd"),
            });
        }

        var owners_ = machines
            .SelectMany(m => m.Owners.Select(o => (Owner: o, Machine: m)))
            .GroupBy(x => x.Owner, StringComparer.OrdinalIgnoreCase)
            .Select(g => new CanvasOwnerDto
            {
                Value = g.Key,
                MachineCount = g.Count(),
                CriticalFindings = g.Sum(x => x.Machine.Findings.Count(f => f.Severity.Equals("critical", StringComparison.OrdinalIgnoreCase))),
                TotalFindings = g.Sum(x => x.Machine.FindingCount),
            })
            .OrderBy(o => o.Value.Equals(UnassignedOwner, StringComparison.OrdinalIgnoreCase) ? 1 : 0)
            .ThenBy(o => o.Value, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var config = assets.Ownership;
        return Ok(new CanvasDto
        {
            Ownership = config is null ? null : new OwnershipInfoDto { Key = config.Key, Label = config.Label },
            Owners = owners_,
            Machines = machines,
        });
    }
}
