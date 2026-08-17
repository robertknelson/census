using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Census;

namespace Census.Web.Services;

/// <summary>
/// Resolves host-identifying names from observed edges to censused machines, and corroborates
/// database edges against what census read there. Extracted from HostingController so blast
/// radius and the hosting pivot share one derivation (blast-radius.md §6) — the same argument
/// as W-3: the resolution rule lives in exactly one place.
/// </summary>
public static class HostResolver
{
    public record MachineSql(string Machine, string SqlStatus, List<(string Instance, HashSet<string> Databases)> Instances);

    public record HostIndex(Dictionary<string, MachineSql> ByName, HashSet<string> Ambiguous);

    /// <summary>
    /// Kinds that name exactly this machine. certSan is excluded because a wildcard or shared
    /// certificate names machines that are not this one, and bindingHostHeader because a
    /// load-balanced name legitimately resolves to several. Joining on either would let one
    /// machine claim another's identity — see census-collector.md §8.1.1.
    /// </summary>
    private static readonly string[] JoinableAliasKinds = ["netbios", "fqdn", "ipv4"];

    /// <summary>
    /// host-identifying name -> what census knows about SQL Server on that machine, drawn from
    /// the alias set so an edge naming an FQDN or an address still matches. A name claimed by
    /// two machines is dropped rather than resolved: picking one would overstate what census
    /// knows, and dropping only understates (decision H-5).
    /// </summary>
    public static HostIndex BuildIndex(List<(string Machine, CensusEnvelope Envelope)> snapshots)
    {
        var claims = new Dictionary<string, List<MachineSql>>(StringComparer.OrdinalIgnoreCase);

        foreach (var (machine, envelope) in snapshots)
        {
            var status = envelope.SqlServer?.Status ?? "not-collected";
            var instances = new List<(string, HashSet<string>)>();

            if (status == "ok")
            {
                foreach (var instance in envelope.SqlServer.Data?.Instances ?? [])
                {
                    // An instance census could not read tells us nothing about which databases
                    // exist, so it must not be able to produce a 'contradicted' verdict.
                    if (instance.ConnectedStatus != "ok") continue;
                    instances.Add((
                        instance.InstanceName ?? "",
                        new HashSet<string>((instance.Databases ?? []).Select(d => d.Name ?? ""), StringComparer.OrdinalIgnoreCase)));
                }
            }

            var entry = new MachineSql(machine, status, instances);

            var names = new List<string> { machine, envelope.ComputerName, envelope.RequestedName };
            if (envelope.Aliases?.Status == "ok")
            {
                names.AddRange((envelope.Aliases.Data?.Aliases ?? [])
                    .Where(a => a.Kind is not null && JoinableAliasKinds.Contains(a.Kind, StringComparer.OrdinalIgnoreCase))
                    .Select(a => a.Value));
            }

            foreach (var name in names)
            {
                if (string.IsNullOrWhiteSpace(name)) continue;
                Claim(claims, name, entry);
                // A short name also answers to its own FQDN prefix.
                var dot = name.IndexOf('.');
                if (dot > 0) Claim(claims, name[..dot], entry);
            }
        }

        var byName = new Dictionary<string, MachineSql>(StringComparer.OrdinalIgnoreCase);
        var ambiguous = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (name, entries) in claims)
        {
            if (entries.Count == 1) byName[name] = entries[0];
            else ambiguous.Add(name);
        }
        return new HostIndex(byName, ambiguous);
    }

    private static void Claim(Dictionary<string, List<MachineSql>> claims, string name, MachineSql entry)
    {
        if (!claims.TryGetValue(name, out var list)) claims[name] = list = [];
        if (!list.Any(e => string.Equals(e.Machine, entry.Machine, StringComparison.OrdinalIgnoreCase)))
            list.Add(entry);
    }

    public static (string Verdict, string Detail) Corroborate(IisDependency edge, HostIndex index)
    {
        // HTTP corroboration means matching a URL host against IIS bindings estate-wide - a
        // second matching problem, deferred with the alias work (census-web.md §11.7).
        if (edge.Kind != "database" || edge.Host is null || edge.Database is null)
            return ("unobserved", null);

        // Silently dropping an ambiguous name would look identical to never having seen it.
        if (index.Ambiguous.Contains(edge.Host))
            return ("unobserved", $"'{edge.Host}' is claimed by more than one censused machine, so it cannot be resolved");

        if (!index.ByName.TryGetValue(edge.Host, out var machine))
            return ("unobserved", $"no censused machine matches host '{edge.Host}'");

        // 'not-present' is proved absence, not ignorance (collector §6.2) - census established
        // there is no SQL Server engine here, so the target cannot exist.
        if (machine.SqlStatus == "not-present")
            return ("contradicted", $"'{edge.Host}' is censused and runs no SQL Server engine");

        // Any other non-ok status means the truth is unknown, which is never an absence.
        if (machine.SqlStatus != "ok")
            return ("unobserved", $"'{edge.Host}' is censused but its sqlserver collector reported '{machine.SqlStatus}'");

        if (machine.Instances.Count == 0)
            return ("unobserved", $"'{edge.Host}' has SQL Server but census could not read any instance");

        var candidates = edge.Instance is null
            ? machine.Instances
            : machine.Instances.Where(i => string.Equals(i.Instance, edge.Instance, StringComparison.OrdinalIgnoreCase)).ToList();

        if (candidates.Count == 0)
            return ("contradicted", $"'{edge.Host}' reports no instance named '{edge.Instance}'");

        return candidates.Any(i => i.Databases.Contains(edge.Database))
            ? ("confirmed", null)
            : ("contradicted", $"'{edge.Host}' reports no database named '{edge.Database}'");
    }
}
