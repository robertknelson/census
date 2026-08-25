using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;
using Census.Web.Models.Assets;

namespace Census.Web.Services;

/// <summary>
/// The unified findings stream (census-web-v2-ux.md §4). Raw truth recomputed per read —
/// no lifecycle, no persistence. Every finding carries its machine's facets so both
/// personas project the same stream: dev-ops filters it, Estate aggregates it.
/// </summary>
public class FindingsEngine(CensusStore censusStore, BlacklistEvaluator blacklistEvaluator, AssetsStore assetsStore, BaselineEvaluator baselineEvaluator, EntityTagsStore entityTagsStore, DeclaredEntitiesStore declaredEntitiesStore, EntityTagsEvaluator entityTagsEvaluator)
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
            .Select(x => (x.Machine, Envelope: x.Envelope))
            .ToList();

        var baselines = baselineEvaluator.EvaluateFleet(asOf);

        var entityTags = entityTagsStore.Load();
        var declaredEntities = declaredEntitiesStore.Load();
        var tagDtos = collected.ToDictionary(
            x => x.Machine,
            x => entityTagsEvaluator.Evaluate(x.Machine, x.Envelope, entityTags, declaredEntities),
            StringComparer.OrdinalIgnoreCase);

        foreach (var (machine, envelope) in collected)
        {
            foreach (var hit in blacklistEvaluator.Evaluate(envelope))
            {
                findings.Add(Build(assets, machine, "prohibited-software", hit.Severity,
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

            // One finding per machine, never one per deviating item: a baseline deviation is
            // open-ended where a blacklist hit is deliberately narrow, and fanning out would
            // be the thing that drowns a stream with no lifecycle (approved-baseline.md §7).
            var deviations = baselines.ByMachine.GetValueOrDefault(machine)?.Deviations ?? [];
            if (deviations.Count > 0)
            {
                var matched = baselines.ByMachine[machine].MatchedBaselines;
                findings.Add(Build(assets, machine, "unapproved-software", "medium",
                    $"{deviations.Count} unapproved item{(deviations.Count == 1 ? "" : "s")}",
                    $"{string.Join(", ", deviations.Select(d => $"{d.DisplayName} {d.DisplayVersion}".Trim()))} — approved by no baseline matching this machine ({string.Join(", ", matched)})."));
            }

            // A separate kind from unapproved-software, not a merged one: the remediations are
            // opposites — install something, versus remove or approve something — and `kind` is
            // how the dev-ops queue is routed. Higher severity because a required item is one
            // somebody deliberately marked, so its absence violates something explicit.
            var missing = baselines.ByMachine.GetValueOrDefault(machine)?.Missing ?? [];
            if (missing.Count > 0)
            {
                findings.Add(Build(assets, machine, "missing-required-software", "high",
                    $"{missing.Count} required item{(missing.Count == 1 ? "" : "s")} missing",
                    $"{string.Join(", ", missing.Select(m => m.DisplayName))} — required by a baseline matching this machine, not installed."));
            }

            if (!assets.Assets.ContainsKey(machine))
            {
                findings.Add(Build(assets, machine, "unassigned", "medium",
                    "No asset assignment",
                    "Machine is collected but carries no facets — invisible to every grouping."));
            }

            // SQL edition (observed) × stage (effective): Developer Edition on a prod-staged
            // machine is a straight license violation, whether the prod stage was asserted
            // or derived from what the machine hosts.
            var assertedStages = assetsStore.FacetsFor(assets, machine).GetValueOrDefault("stage", []);
            var (stages, _) = EntityTagsEvaluator.EffectiveStages(assertedStages, tagDtos[machine].Rollup);
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

            // An override is a statement, not a blindfold (derived-machine-stage.md §3):
            // the asserted stage wins whole, but when what the machine hosts derives a
            // different set, the tension surfaces — a deliberate drain or a stale override,
            // and only a human knows which.
            var derivedStages = tagDtos[machine].Rollup.Stages;
            if (assertedStages.Count > 0 && derivedStages.Count > 0
                && !assertedStages.ToHashSet(StringComparer.OrdinalIgnoreCase).SetEquals(derivedStages))
            {
                findings.Add(Build(assets, machine, "stage-override-drift", "low",
                    $"Stage asserted [{string.Join(", ", assertedStages)}] but hosted entities serve [{string.Join(", ", derivedStages)}]",
                    "assets.json asserts this machine's stage, which overrides the rollup completely. " +
                    "The associations of what it hosts say otherwise; remove the asserted stage to release the machine to the derived set, or re-assert it to match."));
            }
        }

        // Fleet-relative patch drift: within one OS build line (same CurrentBuild), a
        // machine whose UBR trails the newest observed is self-evidently behind — no
        // Microsoft catalog needed, the fleet itself is the reference.
        foreach (var line in collected
            .Where(x => x.Envelope.Os?.Data?.CurrentBuild is not null)
            .GroupBy(x => x.Envelope.Os.Data.CurrentBuild))
        {
            var newestUbr = line.Max(x => x.Envelope.Os.Data.Ubr);
            foreach (var (machine, envelope) in line.Where(x => x.Envelope.Os.Data.Ubr < newestUbr))
            {
                var ubr = envelope.Os.Data.Ubr;
                findings.Add(Build(assets, machine, "behind-fleet-patch", "medium",
                    $"Behind fleet patch level ({line.Key}.{ubr})",
                    $"Newest observed for this OS line in the fleet is {line.Key}.{newestUbr}."));
            }
        }

        // Two machines sharing a machine identity = a VM cloned without sysprep. Breaks
        // WSUS, MDM and licensing in ways nobody traces back — a finding, never deduped.
        foreach (var (selector, label) in new (Func<Models.Census.CensusEnvelope, string>, string)[]
        {
            (e => e.Identity?.Data?.MachineGuid, "machine GUID"),
            (e => e.Identity?.Data?.SmbiosUuid, "SMBIOS UUID"),
        })
        {
            foreach (var dupes in collected
                .Select(x => (x.Machine, Value: selector(x.Envelope)))
                .Where(x => !string.IsNullOrEmpty(x.Value))
                .GroupBy(x => x.Value, StringComparer.OrdinalIgnoreCase)
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

        var runLogByMachine = censusStore.GetRunLogByMachine();
        foreach (var machine in configMachines)
        {
            var runLog = (runLogByMachine.GetValueOrDefault(machine) ?? [])
                .Where(e => e.FinishedUtc <= now)
                .ToList();
            var lastOk = runLog.LastOrDefault(e => e.Outcome == "ok");
            if (lastOk is null)
            {
                var lastRun = runLog.LastOrDefault();

                // Cross-checked against the tree before claiming "never": snapshots on disk
                // with no ok in the log is a provenance problem (restored tree, lost log,
                // hand-placed files), not a collection gap — the log and the tree are
                // independent sources and only the tree decides what was collected.
                var today = DateOnly.FromDateTime(now.UtcDateTime);
                var snapshots = censusStore.GetSnapshotRefs(machine).Where(r => r.Date <= today).ToList();
                if (snapshots.Count > 0)
                {
                    findings.Add(Build(assets, machine, "unlogged-collection", "medium",
                        "Snapshots on disk but no successful run logged",
                        $"Latest snapshot {snapshots[^1].Date:yyyy-MM-dd}. " +
                        (lastRun is null
                            ? "No run-log entries at all — the tree was restored or hand-placed, or the run log was lost."
                            : $"Last attempt {lastRun.FinishedUtc:yyyy-MM-dd}: {lastRun.Outcome}.")));
                }
                else
                {
                    findings.Add(Build(assets, machine, "never-collected", "high",
                        "Never successfully collected",
                        lastRun is null ? "No run-log entries at all." : $"Last attempt {lastRun.FinishedUtc:yyyy-MM-dd}: {lastRun.Outcome}"));
                }
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

        // Entity tags whose address no longer resolves (entity-tags.md §5). One finding per
        // stranded assertion, never a silent drop and never a re-attach — following a rename
        // would be inference. Unknown resolutions stay silent here: a failed collection is
        // not evidence of absence, and the collection failure has its own findings.
        var tagMachines = entityTags.Databases.Keys.Concat(entityTags.Applications.Keys)
            .Distinct(StringComparer.OrdinalIgnoreCase);
        foreach (var machine in tagMachines)
        {
            if (!knownMachines.Contains(machine))
            {
                findings.Add(Build(assets, machine, "dangling-assertion", "low",
                    "Entity tags for a machine not in the fleet",
                    "entity-tags.json names this machine but it has no snapshots and is not in machines.json — a rename or decommission nobody recorded."));
                continue;
            }

            if (!tagDtos.TryGetValue(machine, out var tagDto)) continue;
            foreach (var row in tagDto.Rows
                .Where(r => r.Resolution == EntityTagsEvaluator.ResolutionDangling))
            {
                findings.Add(Build(assets, machine, "dangling-entity-tag", "low",
                    $"Tagged {row.Kind} no longer observed ({row.Container} · {row.Name})",
                    $"The latest snapshot positively lacks it — dropped, moved, or renamed. Its tags ({Describe(row)}) are stranded until someone re-asserts or removes them."));
            }
        }

        // A declared entity itself can never dangle — nothing observed backs it, by
        // construction — but its anchor machine can leave the estate (declared-entities.md §5).
        foreach (var machine in declaredEntities.OnMachines.Keys.Where(m => !knownMachines.Contains(m)))
        {
            findings.Add(Build(assets, machine, "dangling-declared-entity", "low",
                "Declared entities on a machine not in the fleet",
                "declared-entities.json anchors entities to this machine but it has no snapshots and is not in machines.json — a rename or decommission nobody recorded."));
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

    private static string Describe(EntityTagRowDto row) =>
        string.Join(", ", row.System.Select(s => $"system:{s}").Concat(row.Stage.Select(s => $"stage:{s}")));

    private FindingDto Build(AssetsConfig assets, string machine, string kind, string severity, string title, string detail) => new()
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
