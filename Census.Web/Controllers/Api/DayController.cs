using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

/// <summary>
/// The day (day-view.md §3, §10): every machine in the universe with its status on one day —
/// its snapshot that day against its previous snapshot, whatever date that was — or across a
/// From → To range by the Changes panel's rule. The universe is the canvas's: configured
/// machines plus every directory ever collected, so a machine nobody looked at is a row too.
/// </summary>
[ApiController]
[Route("api/day")]
public class DayController(CensusStore censusStore) : ControllerBase
{
    [HttpGet]
    public ActionResult<DayDto> GetDay([FromQuery] string day = null, [FromQuery] string from = null, [FromQuery] string to = null)
    {
        if (from is not null || to is not null)
        {
            if (day is not null) return BadRequest("ask for a day or a range, not both");
            if (!DateOnly.TryParseExact(from, "yyyy-MM-dd", out var parsedFrom)) return BadRequest("from must be yyyy-MM-dd");
            if (!DateOnly.TryParseExact(to, "yyyy-MM-dd", out var parsedTo)) return BadRequest("to must be yyyy-MM-dd");
            if (parsedFrom > parsedTo) return BadRequest("from must not be after to");
            return Ok(new DayDto
            {
                From = Iso(parsedFrom),
                To = Iso(parsedTo),
                Machines = Universe().Select(m => RangeRow(m, parsedFrom, parsedTo)).ToList(),
            });
        }

        DateOnly theDay;
        if (day is not null)
        {
            if (!DateOnly.TryParseExact(day, "yyyy-MM-dd", out theDay)) return BadRequest("day must be yyyy-MM-dd");
        }
        else
        {
            var latest = censusStore.GetFleetDates().FirstOrDefault();
            if (latest == default) return Ok(new DayDto { Machines = Universe().Select(m => new DayMachineDto { Machine = m, Status = "not-collected" }).ToList() });
            theDay = latest;
        }

        return Ok(new DayDto
        {
            Day = Iso(theDay),
            Machines = Universe().Select(m => DayRow(m, theDay)).ToList(),
        });
    }

    /// <summary>Per collected day of the month: how many machines were collected, how many of them changed.</summary>
    [HttpGet("month")]
    public ActionResult<List<DayCountDto>> GetMonth([FromQuery] string month)
    {
        if (!DateOnly.TryParseExact($"{month}-01", "yyyy-MM-dd", out var first)) return BadRequest("month must be yyyy-MM");
        var last = first.AddMonths(1).AddDays(-1);

        var collected = new Dictionary<DateOnly, int>();
        var changed = new Dictionary<DateOnly, int>();
        foreach (var machine in censusStore.GetMachineDirs())
        {
            var refs = censusStore.GetSnapshotRefs(machine);
            for (var i = 0; i < refs.Count; i++)
            {
                if (refs[i].Date < first || refs[i].Date > last) continue;
                collected[refs[i].Date] = collected.GetValueOrDefault(refs[i].Date) + 1;
                if (i == 0) continue;
                if (Entries(machine, refs[i - 1].Date, refs[i].Date).Count > 0)
                    changed[refs[i].Date] = changed.GetValueOrDefault(refs[i].Date) + 1;
            }
        }

        return Ok(collected.Keys.OrderBy(d => d).Select(d => new DayCountDto
        {
            Day = Iso(d),
            Collected = collected[d],
            Changed = changed.GetValueOrDefault(d),
        }).ToList());
    }

    private List<string> Universe() =>
        censusStore.GetMachineDirs()
            .Concat(censusStore.GetMachinesConfig().Names)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(m => m, StringComparer.OrdinalIgnoreCase)
            .ToList();

    private DayMachineDto DayRow(string machine, DateOnly day)
    {
        var refs = censusStore.GetSnapshotRefs(machine);
        var on = refs.FirstOrDefault(r => r.Date == day);
        if (on is null) return new DayMachineDto { Machine = machine, Status = "not-collected" };
        var previous = refs.LastOrDefault(r => r.Date < day);
        if (previous is null) return new DayMachineDto { Machine = machine, Status = "first-seen", ToDate = Iso(day) };
        return Compared(machine, previous.Date, day);
    }

    private DayMachineDto RangeRow(string machine, DateOnly from, DateOnly to)
    {
        var refs = censusStore.GetSnapshotRefs(machine).Where(r => r.Date >= from && r.Date <= to).ToList();
        if (refs.Count == 0) return new DayMachineDto { Machine = machine, Status = "not-collected" };
        if (refs.Count == 1) return new DayMachineDto { Machine = machine, Status = "collected-once", ToDate = Iso(refs[0].Date) };
        return Compared(machine, refs[0].Date, refs[^1].Date);
    }

    private DayMachineDto Compared(string machine, DateOnly from, DateOnly to)
    {
        var entries = Entries(machine, from, to);
        return new DayMachineDto
        {
            Machine = machine,
            Status = entries.Count > 0 ? "changed" : "quiet",
            FromDate = Iso(from),
            ToDate = Iso(to),
            Entries = entries,
        };
    }

    private List<ChangeEntryDto> Entries(string machine, DateOnly from, DateOnly to)
    {
        var fromEnvelope = censusStore.GetSnapshot(machine, from);
        var toEnvelope = censusStore.GetSnapshot(machine, to);
        if (fromEnvelope is null || toEnvelope is null) return [];
        return ChangeEntries.Flatten(DiffEngine.Compute(machine, Iso(from), fromEnvelope, Iso(to), toEnvelope));
    }

    private static string Iso(DateOnly d) => d.ToString("yyyy-MM-dd");
}
