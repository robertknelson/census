using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

/// <summary>
/// The fleet-wide change feed: latest vs previous snapshot for every machine that has
/// both, flattened into one "what changed since yesterday" stream. With from/to, the
/// window instead: each machine's first collected day on or after from against its last
/// on or before to; a machine with fewer than two collected days in the window is not in it.
/// </summary>
[ApiController]
[Route("api/changes")]
public class ChangesController(CensusStore censusStore) : ControllerBase
{
    [HttpGet]
    public ActionResult<ChangeFeedDto> GetChanges([FromQuery] string from = null, [FromQuery] string to = null)
    {
        DateOnly? windowFrom = null, windowTo = null;
        if (from is not null || to is not null)
        {
            if (!DateOnly.TryParseExact(from, "yyyy-MM-dd", out var parsedFrom)) return BadRequest("from must be yyyy-MM-dd");
            if (!DateOnly.TryParseExact(to, "yyyy-MM-dd", out var parsedTo)) return BadRequest("to must be yyyy-MM-dd");
            if (parsedFrom > parsedTo) return BadRequest("from must not be after to");
            windowFrom = parsedFrom;
            windowTo = parsedTo;
        }

        var machines = new List<MachineChangesDto>();

        foreach (var machine in censusStore.GetMachineDirs())
        {
            var refs = censusStore.GetSnapshotRefs(machine);
            if (windowFrom is not null) refs = refs.Where(r => r.Date >= windowFrom && r.Date <= windowTo).ToList();
            if (refs.Count < 2) continue;

            var fromRef = windowFrom is null ? refs[^2] : refs[0];
            var toRef = refs[^1];
            var fromEnvelope = censusStore.GetSnapshot(machine, fromRef.Date);
            var toEnvelope = censusStore.GetSnapshot(machine, toRef.Date);
            if (fromEnvelope is null || toEnvelope is null) continue;

            var diff = DiffEngine.Compute(machine, fromRef.Date.ToString("yyyy-MM-dd"), fromEnvelope, toRef.Date.ToString("yyyy-MM-dd"), toEnvelope);

            var entries = ChangeEntries.Flatten(diff);

            if (entries.Count == 0) continue;

            machines.Add(new MachineChangesDto
            {
                Machine = machine,
                FromDate = fromRef.Date.ToString("yyyy-MM-dd"),
                ToDate = toRef.Date.ToString("yyyy-MM-dd"),
                Entries = entries,
            });
        }

        return Ok(new ChangeFeedDto { Machines = machines });
    }
}
