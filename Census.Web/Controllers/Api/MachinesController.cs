using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;
using Census.Web.Models.Census;
using Census.Web.Options;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/machines")]
public class MachinesController(CensusStore censusStore, BlacklistEvaluator blacklistEvaluator, IOptions<CensusOptions> options) : ControllerBase
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
    public ActionResult<SnapshotDiffDto> GetDiff(string machine, [FromQuery] string from, [FromQuery] string to)
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

    /// <summary>The nights with changes (census-web.md §16): every consecutive pair of collected
    /// days whose diff is not empty, newest first, counted per section. range = week | month | all,
    /// measured back from the newest collected day; capped at Census:ChangesNightsMax pairs.</summary>
    [HttpGet("{machine}/changes")]
    public ActionResult<MachineNightsDto> GetChanges(string machine, [FromQuery] string range = "month")
    {
        var dates = censusStore.GetSnapshotRefs(machine).Select(r => r.Date).ToList();
        if (dates.Count == 0) return NotFound();
        range = range?.ToLowerInvariant() switch { "week" => "week", "all" => "all", _ => "month" };
        var newest = dates[^1];
        var floor = range switch { "week" => newest.AddDays(-7), "month" => newest.AddMonths(-1), _ => DateOnly.MinValue };

        var pairs = new List<(DateOnly Previous, DateOnly Date)>();
        for (var i = dates.Count - 1; i > 0 && dates[i] >= floor; i--) pairs.Add((dates[i - 1], dates[i]));
        var max = Math.Max(1, options.Value.ChangesNightsMax);
        var truncated = pairs.Count > max;
        if (truncated) pairs = pairs.Take(max).ToList();

        var nights = new List<MachineNightDto>();
        CensusEnvelope later = null;
        var laterDate = default(DateOnly);
        foreach (var (previous, date) in pairs)
        {
            var to = laterDate == date ? later : censusStore.GetSnapshot(machine, date);
            var from = censusStore.GetSnapshot(machine, previous);
            later = from;
            laterDate = previous;
            if (to is null || from is null) continue;
            var diff = DiffEngine.Compute(machine, previous.ToString("yyyy-MM-dd"), from, date.ToString("yyyy-MM-dd"), to);
            var sections = diff.Sections
                .Where(x => x.Added.Count + x.Removed.Count + x.Changed.Count > 0)
                .ToDictionary(x => x.Name, x => new SectionCountsDto(x.Added.Count, x.Removed.Count, x.Changed.Count));
            var total = diff.ScalarChanges.Count + sections.Values.Sum(c => c.Added + c.Removed + c.Changed);
            if (total == 0) continue;
            nights.Add(new MachineNightDto
            {
                Date = date.ToString("yyyy-MM-dd"),
                Previous = previous.ToString("yyyy-MM-dd"),
                Scalar = diff.ScalarChanges.Count,
                Sections = sections,
                Total = total,
            });
        }
        return Ok(new MachineNightsDto { Machine = machine, Range = range, NightsLookedAt = pairs.Count, Truncated = truncated, Nights = nights });
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
            .Select(c => (int)Math.Floor((c.NotAfter.Value - DateTimeOffset.UtcNow).TotalDays))
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
