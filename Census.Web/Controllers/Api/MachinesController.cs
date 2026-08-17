using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/machines")]
public class MachinesController(CensusStore censusStore, BlacklistEvaluator blacklistEvaluator) : ControllerBase
{
    [HttpGet]
    public ActionResult<List<MachineSummaryDto>> GetMachines()
    {
        var summaries = censusStore.GetMachineDirs()
            .Select(BuildSummary)
            .ToList();

        return Ok(summaries);
    }

    [HttpGet("{machine}/dates")]
    public ActionResult<List<string>> GetDates(string machine)
    {
        var dates = censusStore.GetSnapshotRefs(machine).Select(r => r.Date.ToString("yyyy-MM-dd")).ToList();
        return Ok(dates);
    }

    [HttpGet("{machine}/snapshots/{date}")]
    public ActionResult<SnapshotDetailDto> GetSnapshot(string machine, string date)
    {
        if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", out var parsedDate)) return BadRequest("date must be yyyy-MM-dd");

        var envelope = censusStore.GetSnapshot(machine, parsedDate);
        if (envelope is null) return NotFound();

        return Ok(new SnapshotDetailDto { Envelope = envelope, BlacklistHits = blacklistEvaluator.Evaluate(envelope) });
    }

    [HttpGet("{machine}/diff")]
    public ActionResult<SnapshotDiffDto> GetDiff(string machine, [FromQuery] string? from, [FromQuery] string? to)
    {
        var dates = censusStore.GetSnapshotRefs(machine).Select(r => r.Date).ToList();
        if (dates.Count == 0) return NotFound();

        var toDate = to is not null && DateOnly.TryParseExact(to, "yyyy-MM-dd", out var parsedTo)
            ? parsedTo
            : dates[^1];

        var toIndex = dates.IndexOf(toDate);
        if (toIndex < 0) return NotFound($"No snapshot for {toDate:yyyy-MM-dd}");

        DateOnly fromDate;
        if (from is not null)
        {
            if (!DateOnly.TryParseExact(from, "yyyy-MM-dd", out fromDate)) return BadRequest("from must be yyyy-MM-dd");
        }
        else if (toIndex > 0)
        {
            fromDate = dates[toIndex - 1];
        }
        else
        {
            return BadRequest("No earlier snapshot to diff against; pass an explicit 'from' date.");
        }

        var fromEnvelope = censusStore.GetSnapshot(machine, fromDate);
        var toEnvelope = censusStore.GetSnapshot(machine, toDate);
        if (fromEnvelope is null || toEnvelope is null) return NotFound();

        return Ok(DiffEngine.Compute(machine, fromDate.ToString("yyyy-MM-dd"), fromEnvelope, toDate.ToString("yyyy-MM-dd"), toEnvelope));
    }

    private MachineSummaryDto BuildSummary(string machineDir)
    {
        var snapshotRefs = censusStore.GetSnapshotRefs(machineDir);
        var latestRef = snapshotRefs.LastOrDefault();
        if (latestRef is null)
        {
            return new MachineSummaryDto { Machine = machineDir };
        }

        var envelope = censusStore.GetSnapshot(machineDir, latestRef.Date);
        if (envelope is null)
        {
            return new MachineSummaryDto { Machine = machineDir };
        }

        var hits = blacklistEvaluator.Evaluate(envelope);
        var highestSeverity = hits
            .OrderBy(h => SeverityRanking.RankOf(h.Severity))
            .Select(h => h.Severity)
            .FirstOrDefault();

        var soonestExpiryDays = envelope.Certificates?.Data?.Certificates
            .Where(c => c.NotAfter.HasValue)
            .Select(c => (int)Math.Floor((c.NotAfter!.Value - DateTimeOffset.UtcNow).TotalDays))
            .OrderBy(days => days)
            .Cast<int?>()
            .FirstOrDefault();

        return new MachineSummaryDto
        {
            Machine = machineDir,
            LatestDate = latestRef.Date.ToString("yyyy-MM-dd"),
            ComputerName = envelope.ComputerName,
            Roles = envelope.Roles,
            ProductName = envelope.Os?.Data?.ProductName,
            InstallationType = envelope.Os?.Data?.InstallationType,
            CurrentBuild = envelope.Os?.Data?.CurrentBuild,
            Ubr = envelope.Os?.Data?.Ubr,
            PendingReboot = envelope.Os?.Data?.PendingReboot,
            IsVirtual = envelope.Identity?.Data?.IsVirtual,
            BlacklistHitCount = hits.Count,
            HighestBlacklistSeverity = highestSeverity,
            SoonestCertExpiryDays = soonestExpiryDays,
        };
    }
}
