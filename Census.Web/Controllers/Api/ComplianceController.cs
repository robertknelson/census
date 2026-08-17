using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/compliance")]
public class ComplianceController(CensusStore censusStore, BlacklistEvaluator blacklistEvaluator) : ControllerBase
{
    [HttpGet("summary")]
    public ActionResult<ComplianceSummaryDto> GetSummary()
    {
        var machineDirs = censusStore.GetMachineDirs();

        // "Right now" figures: latest snapshot per machine.
        var machinesWithHits = 0;
        var hitCountBySeverity = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var machineDir in machineDirs)
        {
            var latestRef = censusStore.GetSnapshotRefs(machineDir).LastOrDefault();
            if (latestRef is null) continue;

            var envelope = censusStore.GetSnapshot(machineDir, latestRef.Date);
            if (envelope is null) continue;

            var hits = blacklistEvaluator.Evaluate(envelope);
            if (hits.Count > 0) machinesWithHits++;
            foreach (var hit in hits)
            {
                hitCountBySeverity[hit.Severity] = hitCountBySeverity.GetValueOrDefault(hit.Severity) + 1;
            }
        }

        // Trend: every date that has at least one snapshot anywhere, not padded to a fixed
        // window — a day nobody was collected on is "no data," not "zero hits found."
        var trend = machineDirs
            .SelectMany(m => censusStore.GetSnapshotRefs(m))
            .GroupBy(r => r.Date)
            .OrderBy(g => g.Key)
            .Select(g =>
            {
                var dayHits = g.Select(r => censusStore.GetSnapshot(r.MachineDir, r.Date))
                    .Where(e => e is not null)
                    .Select(e => blacklistEvaluator.Evaluate(e))
                    .ToList();

                return new ComplianceTrendPoint
                {
                    Date = g.Key.ToString("yyyy-MM-dd"),
                    MachinesCollected = dayHits.Count,
                    MachinesWithHits = dayHits.Count(h => h.Count > 0),
                    TotalHits = dayHits.Sum(h => h.Count),
                };
            })
            .ToList();

        return Ok(new ComplianceSummaryDto
        {
            TotalMachines = machineDirs.Count,
            MachinesWithHits = machinesWithHits,
            HitCountBySeverity = hitCountBySeverity,
            Trend = trend,
        });
    }
}
