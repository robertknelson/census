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

    public FindingsResultDto Compute(DateOnly? asOf = null)
    {
        var assets = assetsStore.Load();
        var machineDirs = censusStore.GetMachineDirs();
        var configMachines = censusStore.GetMachinesConfig().Names;
        var findings = new List<FindingDto>();

        // "Now" for the as-of view is the end of that day — cert expiry and staleness are
        // judged as they would have been judged then.
        var now = asOf is { } d
            ? new DateTimeOffset(d.ToDateTime(new TimeOnly(23, 59, 59)), TimeSpan.Zero)
            : DateTimeOffset.UtcNow;

        var collected = machineDirs
            .Select(m => (Machine: m, Envelope: asOf is { } day ? censusStore.GetSnapshotAsOf(m, day) : censusStore.GetLatestSnapshot(m)))
            .Where(x => x.Envelope is not null)
            .Select(x => (x.Machine, Envelope: x.Envelope!))
            .ToList();

        foreach (var (machine, envelope) in collected)
        {
            foreach (var hit in blacklistEvaluator.Evaluate(envelope))
            {
                findings.Add(Build(assets, machine, "blacklist-hit", hit.Severity,
                    $"{hit.MatchedName} {hit.MatchedVersion}",
                    hit.VersionUnparseable ? $"{hit.Reason} (version unparseable — needs manual review)" : hit.Reason));
            }

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

            // SQL edition (observed) × stage (asserted): Developer Edition on a prod-staged
            // machine is a straight license violation.
            var stages = assetsStore.FacetsFor(assets, machine).GetValueOrDefault("stage", []);
            if (stages.Contains("prod", StringComparer.OrdinalIgnoreCase))
            {
                foreach (var instance in envelope.SqlServer?.Data?.Instances ?? [])
                {
                    if (instance.Edition?.Contains("Developer", StringComparison.OrdinalIgnoreCase) == true)
                    {
                        findings.Add(Build(assets, machine, "developer-edition-in-prod", "critical",
                            $"SQL Server Developer Edition on a prod machine ({instance.InstanceName})",
                            $"{instance.Edition} — Developer Edition is not licensed for production use."));
                    }
                }
            }
        }

        // Fleet-relative patch drift: within one OS build line (same CurrentBuild), a
        // machine whose UBR trails the newest observed is self-evidently behind — no
        // Microsoft catalog needed, the fleet itself is the reference.
        foreach (var line in collected
            .Where(x => x.Envelope.Os?.Data?.CurrentBuild is not null)
            .GroupBy(x => x.Envelope.Os!.Data!.CurrentBuild!))
        {
            var newestUbr = line.Max(x => x.Envelope.Os!.Data!.Ubr);
            foreach (var (machine, envelope) in line.Where(x => x.Envelope.Os!.Data!.Ubr < newestUbr))
            {
                var ubr = envelope.Os!.Data!.Ubr;
                findings.Add(Build(assets, machine, "behind-fleet-patch", "medium",
                    $"Behind fleet patch level ({line.Key}.{ubr})",
                    $"Newest observed for this OS line in the fleet is {line.Key}.{newestUbr}."));
            }
        }

        // Two machines sharing a machine identity = a VM cloned without sysprep. Breaks
        // WSUS, MDM and licensing in ways nobody traces back — a finding, never deduped.
        foreach (var (selector, label) in new (Func<Models.Census.CensusEnvelope, string?>, string)[]
        {
            (e => e.Identity?.Data?.MachineGuid, "machine GUID"),
            (e => e.Identity?.Data?.SmbiosUuid, "SMBIOS UUID"),
        })
        {
            foreach (var dupes in collected
                .Select(x => (x.Machine, Value: selector(x.Envelope)))
                .Where(x => !string.IsNullOrEmpty(x.Value))
                .GroupBy(x => x.Value!, StringComparer.OrdinalIgnoreCase)
                .Where(g => g.Count() > 1))
            {
                var members = dupes.Select(x => x.Machine).ToList();
                foreach (var machine in members)
                {
                    findings.Add(Build(assets, machine, "duplicate-machine-identity", "high",
                        $"Shares its {label} with {string.Join(", ", members.Where(m => m != machine))}",
                        "Identical hardware identity across machines means a VM was cloned without sysprep."));
                }
            }
        }

        foreach (var machine in configMachines)
        {
            var runLog = censusStore.GetRunLogFor(machine)
                .Where(e => e.FinishedUtc <= now)
                .ToList();
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
                var ageDays = (int)(now - lastOk.FinishedUtc).TotalDays;
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
