using Census.Web.Models.Api;
using Census.Web.Models.Baselines;
using Census.Web.Models.Census;

namespace Census.Web.Services;

/// <summary>
/// The inverse of the blacklist (approved-baseline.md). A machine's approved set is the union
/// of every active baseline that matches it; anything installed and outside that union is a
/// deviation. Recomputed per read, like every other finding source.
/// </summary>
public class BaselineEvaluator(CensusStore censusStore, AssetsStore assetsStore, BaselinesStore baselinesStore)
{
    public const string StatusOk = "ok";
    public const string StatusNotInScope = "not-in-scope";
    public const string StatusNotJudgeable = "not-judgeable";

    public const string ScopeMachine = "machine";
    public const string ScopePerUser = "per-user";

    /// <summary>Selector keys that are not `assets.json` facets. Reserved keys win a collision.</summary>
    public const string ClassKey = "class";
    public const string MachineKey = "machine";

    /// <summary>
    /// Cross-machine identity (§6.1): the owning SID is dropped because it is machine-local,
    /// and the publisher stays out because vendor renames would read as a simultaneous
    /// missing-and-extra. Deliberately not `DiffEngine.AppKey`, which solves the other problem.
    /// </summary>
    public static string EntryKey(string? displayName, string? architecture, string installScope) =>
        $"{displayName?.Trim().ToLowerInvariant()}|{architecture?.Trim().ToLowerInvariant()}|{installScope.ToLowerInvariant()}";

    public static string InstallScopeOf(AppEntry entry) =>
        string.Equals(entry.Hive, "HKU", StringComparison.OrdinalIgnoreCase) ? ScopePerUser : ScopeMachine;

    /// <summary>
    /// Servicing rows are not installed software; including them would turn the comparison
    /// into a patch-level one that differs on every machine every month (§6.2).
    /// </summary>
    public static bool IsComparable(AppEntry entry) =>
        !entry.SystemComponent && !string.IsNullOrWhiteSpace(entry.DisplayName);

    public static bool Matches(Baseline baseline, string machine, string resolvedClass, Dictionary<string, List<string>> facets)
    {
        foreach (var (key, wanted) in baseline.AppliesTo)
        {
            // Facet keys are compared case-insensitively everywhere else in the semantic
            // layer, and a round-trip through System.Text.Json drops the dictionary's
            // comparer — so the lookup, not the dictionary, has to be case-insensitive.
            List<string> held =
                string.Equals(key, ClassKey, StringComparison.OrdinalIgnoreCase) ? [resolvedClass]
                : string.Equals(key, MachineKey, StringComparison.OrdinalIgnoreCase) ? [machine]
                : facets.FirstOrDefault(f => string.Equals(f.Key, key, StringComparison.OrdinalIgnoreCase)).Value ?? [];

            if (!held.Any(h => wanted.Contains(h, StringComparer.OrdinalIgnoreCase))) return false;
        }
        return true;
    }

    /// <summary>
    /// Every collected machine judged in one pass — the shape both the findings stream and the
    /// baselines panel need, so the class-and-facet resolution lives in exactly one place.
    /// </summary>
    public FleetBaselineResult EvaluateFleet(DateOnly? asOf = null)
    {
        var config = baselinesStore.Load();
        var assets = assetsStore.Load();
        var byMachine = new Dictionary<string, MachineBaselineDto>(StringComparer.OrdinalIgnoreCase);
        var matchCounts = config.Baselines.ToDictionary(b => b.Id, _ => 0, StringComparer.OrdinalIgnoreCase);
        var judgeableCounts = config.Baselines.ToDictionary(b => b.Id, _ => 0, StringComparer.OrdinalIgnoreCase);
        var presentCounts = new Dictionary<(string BaselineId, string EntryKey), int>();

        foreach (var machine in censusStore.GetMachineDirs())
        {
            var envelope = asOf is { } day ? censusStore.GetSnapshotAsOf(machine, day) : censusStore.GetLatestSnapshot(machine);
            if (envelope is null) continue;

            var facets = assetsStore.FacetsFor(assets, machine);
            var (resolvedClass, _) = MachineClassifier.Resolve(assets.Assets.GetValueOrDefault(machine)?.Class, envelope.Roles);
            byMachine[machine] = Evaluate(config, machine, resolvedClass, facets, envelope);
            var installed = InstalledKeysOf(envelope);
            var judgeable = byMachine[machine].Status == StatusOk;

            // Counted for every baseline, retired ones included, so switching one off shows
            // what it would cover rather than dropping the number to nothing.
            foreach (var baseline in config.Baselines.Where(b => Matches(b, machine, resolvedClass, facets)))
            {
                matchCounts[baseline.Id]++;
                if (!judgeable) continue;
                judgeableCounts[baseline.Id]++;

                // Per-entry presence, so a requirement that matches nothing anywhere reads as
                // "found on 0 of N" in the panel rather than quietly indicting every machine.
                foreach (var entry in baseline.Entries)
                {
                    var entryKey = EntryKey(entry.DisplayName, entry.Architecture, entry.InstallScope);
                    var key = (baseline.Id, entryKey);
                    presentCounts[key] = presentCounts.GetValueOrDefault(key) + (installed.Contains(entryKey) ? 1 : 0);
                }
            }
        }

        return new FleetBaselineResult
        {
            Config = config,
            ByMachine = byMachine,
            MatchCountsById = matchCounts,
            JudgeableCountsById = judgeableCounts,
            PresentCountsByEntry = presentCounts,
            Coverage = new BaselineCoverageDto
            {
                Machines = byMachine.Count,
                InScope = byMachine.Values.Count(m => m.Status != StatusNotInScope),
                NotJudgeable = byMachine.Values.Count(m => m.Status == StatusNotJudgeable),
            },
        };
    }

    public MachineBaselineDto Evaluate(
        BaselinesConfig config,
        string machine,
        string resolvedClass,
        Dictionary<string, List<string>> facets,
        CensusEnvelope? envelope)
    {
        var matched = config.Baselines
            .Where(b => b.Active && Matches(b, machine, resolvedClass, facets))
            .ToList();

        if (matched.Count == 0)
        {
            return new MachineBaselineDto { Machine = machine, Status = StatusNotInScope, MatchedBaselines = [] };
        }

        var matchedIds = matched.Select(b => b.Id).ToList();

        // §6.1 of the collector spec is binding: read status before touching data. Software
        // that could not be collected cannot be judged, and must never render as approved.
        var apps = envelope?.Apps;
        if (apps is null || apps.Status != "ok")
        {
            return new MachineBaselineDto
            {
                Machine = machine,
                Status = StatusNotJudgeable,
                Reason = apps is null ? "Software was not collected." : $"Software collection is {apps.Status} — {apps.Reason}",
                MatchedBaselines = matchedIds,
            };
        }

        var approved = matched
            .SelectMany(b => b.Entries)
            .Select(e => EntryKey(e.DisplayName, e.Architecture, e.InstallScope))
            .ToHashSet();

        var installed = InstalledKeysOf(envelope);

        // Required wins across the union: a requirement asserted by any matching baseline
        // holds, even where a narrower one merely permits the same thing (§6.4).
        var missing = matched
            .SelectMany(b => b.Entries.Where(e => e.Required))
            .GroupBy(e => EntryKey(e.DisplayName, e.Architecture, e.InstallScope))
            .Where(g => !installed.Contains(g.Key))
            .Select(g => g.First())
            .Select(e => new BaselineMissingDto
            {
                DisplayName = e.DisplayName,
                Publisher = e.Publisher,
                Architecture = e.Architecture,
                InstallScope = e.InstallScope,
            })
            .OrderBy(m => m.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var deviations = (apps.Data?.Entries ?? [])
            .Where(IsComparable)
            .Where(e => !approved.Contains(EntryKey(e.DisplayName, e.Architecture, InstallScopeOf(e))))
            .GroupBy(e => EntryKey(e.DisplayName, e.Architecture, InstallScopeOf(e)))
            .Select(g => g.First())
            .Select(e => new BaselineDeviationDto
            {
                DisplayName = e.DisplayName!,
                DisplayVersion = e.DisplayVersion,
                Publisher = e.Publisher,
                Architecture = e.Architecture,
                InstallScope = InstallScopeOf(e),
            })
            .OrderBy(d => d.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new MachineBaselineDto
        {
            Machine = machine,
            Status = StatusOk,
            MatchedBaselines = matchedIds,
            Deviations = deviations,
            Missing = missing,
        };
    }

    /// <summary>Comparable installed identities — the set both directions are judged against.</summary>
    public static HashSet<string> InstalledKeysOf(CensusEnvelope? envelope)
    {
        var apps = envelope?.Apps;
        if (apps is null || apps.Status != "ok") return [];
        return (apps.Data?.Entries ?? [])
            .Where(IsComparable)
            .Select(e => EntryKey(e.DisplayName, e.Architecture, InstallScopeOf(e)))
            .ToHashSet();
    }

    /// <summary>The approved set as it would be blessed from this machine's latest snapshot.</summary>
    public static List<BaselineEntry> EntriesFrom(CensusEnvelope envelope) =>
        (envelope.Apps?.Data?.Entries ?? [])
            .Where(IsComparable)
            .GroupBy(e => EntryKey(e.DisplayName, e.Architecture, InstallScopeOf(e)))
            .Select(g => g.First())
            .Select(e => new BaselineEntry
            {
                DisplayName = e.DisplayName!,
                Publisher = e.Publisher,
                Architecture = e.Architecture,
                InstallScope = InstallScopeOf(e),
                ObservedVersion = e.DisplayVersion,
            })
            .OrderBy(e => e.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();
}

public record FleetBaselineResult
{
    public required BaselinesConfig Config { get; init; }
    public required Dictionary<string, MachineBaselineDto> ByMachine { get; init; }
    public required Dictionary<string, int> MatchCountsById { get; init; }

    /// <summary>Matched machines whose software could actually be judged — the honest denominator.</summary>
    public required Dictionary<string, int> JudgeableCountsById { get; init; }

    /// <summary>
    /// How many judgeable matched machines carry each (baseline, entry). A tuple key rather
    /// than a composed string: the two sides of the lookup cannot drift apart on a separator.
    /// </summary>
    public required Dictionary<(string BaselineId, string EntryKey), int> PresentCountsByEntry { get; init; }

    public required BaselineCoverageDto Coverage { get; init; }
}
