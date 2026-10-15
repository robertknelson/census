using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.Models.Api;
using Census.Web.Models.Assets;
using Census.Web.Models.Baselines;
using Census.Web.Models.Census;
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
public class DayController(CensusStore censusStore, FindingsEngine findingsEngine, BaselineEvaluator baselineEvaluator, BaselinesStore baselinesStore, AssetsStore assetsStore) : ControllerBase
{
    private BaselinesConfig _baselines;
    private AssetsConfig _assets;

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
                Findings = Findings(parsedFrom, parsedTo),
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
            Findings = Findings(theDay.AddDays(-1), theDay),
        });
    }

    private DayFindingsDto Findings(DateOnly before, DateOnly asOf)
    {
        var earlier = findingsEngine.Compute(before).Findings.DistinctBy(f => f.Key).ToDictionary(f => f.Key);
        var later = findingsEngine.Compute(asOf).Findings.DistinctBy(f => f.Key).ToDictionary(f => f.Key);
        return new DayFindingsDto
        {
            Before = Iso(before),
            AsOf = Iso(asOf),
            Born = later.Values.Where(f => !earlier.ContainsKey(f.Key)).ToList(),
            Cleared = earlier.Values.Where(f => !later.ContainsKey(f.Key)).ToList(),
        };
    }

    /// <summary>Per collected day of the month: how many machines were collected, how many of them changed.</summary>
    [HttpGet("month")]
    public ActionResult<List<DayCountDto>> GetMonth([FromQuery] string month)
    {
        if (!DateOnly.TryParseExact($"{month}-01", "yyyy-MM-dd", out var first)) return BadRequest("month must be yyyy-MM");
        var last = first.AddMonths(1).AddDays(-1);

        // machines × collected days diffs (§10): machines in parallel, each walking its own
        // snapshots in order; the store's snapshot cache makes the second look at a month cheap.
        var collected = new Dictionary<DateOnly, int>();
        var changed = new Dictionary<DateOnly, int>();
        var gate = new object();
        Parallel.ForEach(censusStore.GetMachineDirs(), machine =>
        {
            var refs = censusStore.GetSnapshotRefs(machine);
            var mine = new List<(DateOnly Day, bool Changed)>();
            for (var i = 0; i < refs.Count; i++)
            {
                if (refs[i].Date < first || refs[i].Date > last) continue;
                mine.Add((refs[i].Date, i > 0 && Entries(machine, refs[i - 1].Date, refs[i].Date).Any(e => !e.Drift)));
            }
            lock (gate)
            {
                foreach (var (day, wasChanged) in mine)
                {
                    collected[day] = collected.GetValueOrDefault(day) + 1;
                    if (wasChanged) changed[day] = changed.GetValueOrDefault(day) + 1;
                }
            }
        });

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
        // Drift alone does not make a machine changed (§5): the rows are kept, so the day's
        // fold can still name the machine, but the headline and the grid discount them.
        var entries = Entries(machine, from, to, judge: true);
        return new DayMachineDto
        {
            Machine = machine,
            Status = entries.Any(e => !e.Drift) ? "changed" : "quiet",
            FromDate = Iso(from),
            ToDate = Iso(to),
            Entries = entries,
        };
    }

    private List<ChangeEntryDto> Entries(string machine, DateOnly from, DateOnly to, bool judge = false)
    {
        var fromEnvelope = censusStore.GetSnapshot(machine, from);
        var toEnvelope = censusStore.GetSnapshot(machine, to);
        if (fromEnvelope is null || toEnvelope is null) return [];
        var diff = DiffEngine.Compute(machine, Iso(from), fromEnvelope, Iso(to), toEnvelope);
        return ChangeEntries.Flatten(diff, judge ? Expectation(machine, fromEnvelope, toEnvelope) : null);
    }

    /// <summary>
    /// Expected or not (day-view.md §5b), for installed software only: an item added that the
    /// machine's approved set covers is expected, one that lands as a deviation is not; an
    /// item removed that was required is unexpected, one that was a deviation is expected.
    /// Judged against the row's own two snapshots. Silent (null) when the machine is outside
    /// every baseline or its software could not be judged, and on a version change — the
    /// baseline does not compare versions (approved-baseline.md §6).
    /// </summary>
    private Func<string, string, DiffItem, string> Expectation(string machine, CensusEnvelope fromEnvelope, CensusEnvelope toEnvelope)
    {
        _baselines ??= baselinesStore.Load();
        _assets ??= assetsStore.Load();
        var before = Judge(machine, fromEnvelope);
        var after = Judge(machine, toEnvelope);
        var fromApps = DiffEngine.KeyedApps(fromEnvelope.Apps?.Data?.Entries ?? []);
        var toApps = DiffEngine.KeyedApps(toEnvelope.Apps?.Data?.Entries ?? []);

        static string KeyOf(AppEntry e) => BaselineEvaluator.EntryKey(e.DisplayName, e.Architecture, BaselineEvaluator.InstallScopeOf(e));
        static bool Deviates(MachineBaselineDto judged, string key) =>
            judged.Status == BaselineEvaluator.StatusOk && judged.Deviations.Any(d => BaselineEvaluator.EntryKey(d.DisplayName, d.Architecture, d.InstallScope) == key);
        static bool Misses(MachineBaselineDto judged, string key) =>
            judged.Status == BaselineEvaluator.StatusOk && judged.Missing.Any(m => BaselineEvaluator.EntryKey(m.DisplayName, m.Architecture, m.InstallScope) == key);

        return (section, kind, item) =>
        {
            if (section != "apps") return null;
            if (kind == "added")
            {
                if (after.Status != BaselineEvaluator.StatusOk || !toApps.TryGetValue(item.Key, out var added) || !BaselineEvaluator.IsComparable(added)) return null;
                return Deviates(after, KeyOf(added)) ? "unexpected" : "expected";
            }
            if (kind == "removed")
            {
                if (!fromApps.TryGetValue(item.Key, out var removed) || !BaselineEvaluator.IsComparable(removed)) return null;
                var key = KeyOf(removed);
                if (Misses(after, key)) return "unexpected";
                if (Deviates(before, key)) return "expected";
                return null;
            }
            return null;
        };
    }

    private MachineBaselineDto Judge(string machine, CensusEnvelope envelope)
    {
        var facets = baselineEvaluator.MatchingFacets(_assets, machine, envelope);
        var (resolvedClass, _) = MachineClassifier.Resolve(_assets.Assets.GetValueOrDefault(machine)?.Class, envelope.Roles);
        return baselineEvaluator.Evaluate(_baselines, machine, resolvedClass, facets, envelope);
    }

    private static string Iso(DateOnly d) => d.ToString("yyyy-MM-dd");
}
