using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

/// <summary>
/// Audit evidence: the fleet's current compliance state as a flat CSV. One row per
/// machine-finding; machines with nothing wrong still appear once so the export proves
/// coverage, not just problems.
/// </summary>
[ApiController]
[Route("api/export")]
public class ExportController(CensusStore censusStore, AssetsStore assetsStore, FindingsEngine findingsEngine) : ControllerBase
{
    [HttpGet("compliance.csv")]
    public IActionResult GetComplianceCsv([FromQuery] string? asOf)
    {
        DateOnly? asOfDate = null;
        if (asOf is not null)
        {
            if (!DateOnly.TryParseExact(asOf, "yyyy-MM-dd", out var parsed)) return BadRequest("asOf must be yyyy-MM-dd");
            asOfDate = parsed;
        }

        var assets = assetsStore.Load();
        var result = findingsEngine.Compute(asOfDate);
        var findingsByMachine = result.Findings
            .GroupBy(f => f.Machine, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var universe = censusStore.GetMachineDirs()
            .Concat(censusStore.GetMachinesConfig().Names)
            .Concat(assets.Assets.Keys)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(m => m, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var ownershipLabel = assets.Ownership?.Label ?? "Owner";
        var sb = new StringBuilder();
        sb.AppendLine($"Machine,Class,{Csv(ownershipLabel)},Stage,LastCollected,Posture,Severity,FindingKind,Finding,Detail");

        foreach (var machine in universe)
        {
            var envelope = asOfDate is { } day ? censusStore.GetSnapshotAsOf(machine, day) : censusStore.GetLatestSnapshot(machine);
            var entry = assets.Assets.GetValueOrDefault(machine);
            var (resolvedClass, _) = MachineClassifier.Resolve(entry?.Class, envelope?.Roles ?? []);
            var facets = assetsStore.FacetsFor(assets, machine);
            var owners = string.Join("; ", assetsStore.OwnershipValuesFor(assets, machine));
            var stages = string.Join("; ", facets.GetValueOrDefault("stage", []));
            var lastCollected = (asOfDate is { } d2 ? censusStore.GetSnapshotRefAsOf(machine, d2) : censusStore.GetSnapshotRefs(machine).LastOrDefault())
                ?.Date.ToString("yyyy-MM-dd") ?? "never";
            var findings = findingsByMachine.GetValueOrDefault(machine, []);

            var posture = findings.Any(f => f.Severity.Equals("critical", StringComparison.OrdinalIgnoreCase)) ? "red"
                : findings.Count > 0 ? "degraded"
                : envelope is null ? "no-data"
                : "clean";

            var prefix = $"{Csv(machine)},{Csv(resolvedClass)},{Csv(owners)},{Csv(stages)},{Csv(lastCollected)},{Csv(posture)}";
            if (findings.Count == 0)
            {
                sb.AppendLine($"{prefix},,,,");
            }
            else
            {
                foreach (var f in findings)
                {
                    sb.AppendLine($"{prefix},{Csv(f.Severity)},{Csv(f.Kind)},{Csv(f.Title)},{Csv(f.Detail ?? "")}");
                }
            }
        }

        var fileName = asOfDate is { } stamp
            ? $"census-compliance-asof-{stamp:yyyyMMdd}.csv"
            : $"census-compliance-{DateTime.UtcNow:yyyyMMdd}.csv";
        // UTF-8 BOM so Excel opens the em-dashes in finding text correctly.
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
        return File(bytes, "text/csv", fileName);
    }

    private static string Csv(string value)
    {
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n') || value.Contains('\r'))
        {
            return $"\"{value.Replace("\"", "\"\"")}\"";
        }
        return value;
    }
}
