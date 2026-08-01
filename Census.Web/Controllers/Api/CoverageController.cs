using Census.Web.Models.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/coverage")]
public class CoverageController(CensusStore censusStore) : ControllerBase
{
    [HttpGet]
    public ActionResult<List<MachineCoverageDto>> GetCoverage()
    {
        var config = censusStore.GetMachinesConfig();
        var now = DateTimeOffset.UtcNow;

        var coverage = config.Machines.Select(machine =>
        {
            var snapshotRefs = censusStore.GetSnapshotRefs(machine);
            var snapshotDates = snapshotRefs.Select(r => r.Date).ToHashSet();
            var runLog = censusStore.GetRunLogFor(machine);

            var lastRun = runLog.LastOrDefault();
            var lastOk = runLog.LastOrDefault(e => e.Outcome == "ok");
            var lastOkAgeDays = lastOk is not null ? (int)(now - lastOk.FinishedUtc).TotalDays : (int?)null;

            var orphanOkNoFile = runLog.Any(e =>
                e.Outcome == "ok" && !snapshotDates.Contains(DateOnly.FromDateTime(e.FinishedUtc.UtcDateTime)));

            return new MachineCoverageDto
            {
                Machine = machine,
                EverCollected = snapshotRefs.Count > 0,
                LastSnapshotDate = snapshotRefs.LastOrDefault()?.Date.ToString("yyyy-MM-dd"),
                LastRunOutcome = lastRun?.Outcome,
                LastRunReason = lastRun?.Reason,
                LastRunDate = lastRun?.FinishedUtc.ToString("yyyy-MM-dd"),
                LastOkDate = lastOk?.FinishedUtc.ToString("yyyy-MM-dd"),
                LastOkAgeDays = lastOkAgeDays,
                OrphanOkNoFile = orphanOkNoFile,
            };
        }).ToList();

        return Ok(coverage);
    }
}
