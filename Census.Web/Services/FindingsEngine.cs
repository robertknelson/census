using Census.Web.Models.Api;
using Census.Web.Models.Assets;

namespace Census.Web.Services;

/// <summary>
/// The unified findings stream (census-web-v2-ux.md §4). Raw truth recomputed per read —
/// no lifecycle, no persistence. Every finding carries its machine's facets so both
/// personas project the same stream: dev-ops filters it, Estate aggregates it.
/// </summary>
public class FindingsEngine(CensusStore censusStore, BlacklistEvaluator blacklistEvaluator, AssetsStore assetsStore)
{
    // Provisional per-kind severities — same caveat as SeverityRanking (tiers unratified).
    private const int CertExpiryWarningDays = 30;
    private const int StaleCollectionDays = 3;

    public FindingsResultDto Compute()
    {
        var assets = assetsStore.Load();
        var machineDirs = censusStore.GetMachineDirs();
        var configMachines = censusStore.GetMachinesConfig().Machines;
        var findings = new List<FindingDto>();

        foreach (var machine in machineDirs)
        {
            var envelope = censusStore.GetLatestSnapshot(machine);
            if (envelope is null) continue;

            foreach (var hit in blacklistEvaluator.Evaluate(envelope))
            {
                findings.Add(Build(assets, machine, "blacklist-hit", hit.Severity,
                    $"{hit.MatchedName} {hit.MatchedVersion}",
                    hit.VersionUnparseable ? $"{hit.Reason} (version unparseable — needs manual review)" : hit.Reason));
            }

            var now = DateTimeOffset.UtcNow;
            foreach (var cert in envelope.Certificates?.Data?.Certificates ?? [])
            {
                if (cert.BoundTo.Count == 0 || !cert.NotAfter.HasValue) continue;
                var days = (int)Math.Floor((cert.NotAfter.Value - now).TotalDays);
                if (days < 0)
                {
                    findings.Add(Build(assets, machine, "certificate-expired", "critical",
                        $"{cert.Subject} expired {Math.Abs(days)}d ago",
                        $"Bound to {string.Join(", ", cert.BoundTo)} — expired {cert.NotAfter:yyyy-MM-dd}"));
                }
                else if (days <= CertExpiryWarningDays)
                {
                    findings.Add(Build(assets, machine, "certificate-expiring", "high",
                        $"{cert.Subject} expires in {days}d",
                        $"Bound to {string.Join(", ", cert.BoundTo)} — expires {cert.NotAfter:yyyy-MM-dd}"));
                }
            }

            if (envelope.Os?.Data?.PendingReboot == true)
            {
                findings.Add(Build(assets, machine, "pending-reboot", "low",
                    "Pending reboot",
                    string.Join(", ", envelope.Os.Data.PendingRebootReasons)));
            }

            if (!assets.Assets.ContainsKey(machine))
            {
                findings.Add(Build(assets, machine, "unassigned", "medium",
                    "No asset assignment",
                    "Machine is collected but carries no facets — invisible to every grouping."));
            }
        }

        foreach (var machine in configMachines)
        {
            var runLog = censusStore.GetRunLogFor(machine);
            var lastOk = runLog.LastOrDefault(e => e.Outcome == "ok");
            if (lastOk is null)
            {
                var lastRun = runLog.LastOrDefault();
                findings.Add(Build(assets, machine, "never-collected", "high",
                    "Never successfully collected",
                    lastRun is null ? "No run-log entries at all." : $"Last attempt {lastRun.FinishedUtc:yyyy-MM-dd}: {lastRun.Outcome}"));
            }
            else
            {
                var ageDays = (int)(DateTimeOffset.UtcNow - lastOk.FinishedUtc).TotalDays;
                if (ageDays > StaleCollectionDays)
                {
                    findings.Add(Build(assets, machine, "stale-collection", "medium",
                        $"Last successful collection {ageDays}d ago",
                        $"Last ok {lastOk.FinishedUtc:yyyy-MM-dd}; a stale machine is a compliance blind spot, not a clean bill."));
                }
            }
        }

        var knownMachines = machineDirs
            .Concat(configMachines)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var asserted in assets.Assets.Keys.Where(m => !knownMachines.Contains(m)))
        {
            findings.Add(Build(assets, asserted, "dangling-assertion", "low",
                "Assignment for a machine not in the fleet",
                "assets.json names this machine but it has no snapshots and is not in machines.json — a rename or decommission nobody recorded."));
        }

        return new FindingsResultDto
        {
            Ownership = assets.Ownership is null ? null : new OwnershipInfoDto { Key = assets.Ownership.Key, Label = assets.Ownership.Label },
            Findings = findings
                .OrderBy(f => SeverityRanking.RankOf(f.Severity))
                .ThenBy(f => f.Machine, StringComparer.OrdinalIgnoreCase)
                .ToList(),
        };
    }

    private FindingDto Build(AssetsConfig assets, string machine, string kind, string severity, string title, string? detail) => new()
    {
        Kind = kind,
        Severity = severity,
        Machine = machine,
        Title = title,
        Detail = detail,
        Facets = assetsStore.FacetsFor(assets, machine),
        Ownership = assetsStore.OwnershipValuesFor(assets, machine),
    };
}
