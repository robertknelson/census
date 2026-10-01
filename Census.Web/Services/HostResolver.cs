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

    /// <summary>One IIS binding as census read it, with the site that owns it.</summary>
    public record SiteBinding(string Machine, string Site, string Protocol, int Port, string HostHeader);

    public record HostIndex(
        Dictionary<string, MachineSql> ByName,
        HashSet<string> Ambiguous,
        List<SiteBinding> Bindings,
        Dictionary<string, string> IisStatus,
        Dictionary<(string Machine, string Site), List<string>> AppPaths);

    /// <summary>
    /// Where an http edge lands (census-web.md §13): <c>site</c> — one or more IIS sites (a
    /// farm when several); <c>machine</c> — a known machine where no IIS site answers;
    /// <c>ambiguous</c> — census cannot tell which; <c>none</c> — not the estate at all.
    /// </summary>
    public record HttpTarget(string Status, List<(string Machine, string Site, string AppPath)> Sites, string Machine, string Detail)
    {
        public bool InEstate => Status != "none";
    }

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
        var bindings = new List<SiteBinding>();
        var iisStatus = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var appPaths = new Dictionary<(string, string), List<string>>(SiteKeyComparer.Instance);

        foreach (var (machine, envelope) in snapshots)
        {
            iisStatus[machine] = envelope.Iis?.Status ?? "not-collected";
            if (envelope.Iis?.Status == "ok")
            {
                foreach (var site in envelope.Iis.Data?.Sites ?? [])
                {
                    foreach (var b in site.Bindings ?? [])
                    {
                        if (!b.Parsed || b.Port is null || string.IsNullOrEmpty(b.Protocol)) continue;
                        bindings.Add(new SiteBinding(machine, site.Name, b.Protocol.ToLowerInvariant(), b.Port.Value, b.HostHeader ?? ""));
                    }
                }
                foreach (var app in envelope.Iis.Data?.Applications ?? [])
                {
                    var key = (machine, app.SiteName ?? "");
                    if (!appPaths.TryGetValue(key, out var paths)) appPaths[key] = paths = [];
                    paths.Add(string.IsNullOrEmpty(app.Path) ? "/" : app.Path);
                }
            }

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
        return new HostIndex(byName, ambiguous, bindings, iisStatus, appPaths);
    }

    private sealed class SiteKeyComparer : IEqualityComparer<(string Machine, string Site)>
    {
        public static readonly SiteKeyComparer Instance = new();
        public bool Equals((string Machine, string Site) a, (string Machine, string Site) b) =>
            string.Equals(a.Machine, b.Machine, StringComparison.OrdinalIgnoreCase) && string.Equals(a.Site, b.Site, StringComparison.OrdinalIgnoreCase);
        public int GetHashCode((string Machine, string Site) k) =>
            HashCode.Combine(k.Machine?.ToLowerInvariant(), k.Site?.ToLowerInvariant());
    }

    /// <summary>
    /// An http edge matched against IIS bindings the way IIS picks a site (census-web.md §13.2):
    /// scheme and port, then an exact host-header binding, else an estate machine's blank-header
    /// catch-all. Nothing is guessed — no suffix, wildcard or DNS — and an unreadable IIS is
    /// unknown, never "no site".
    /// </summary>
    public static HttpTarget ResolveHttp(IisDependency edge, string sourceMachine, HostIndex index)
    {
        if (edge.Kind != "http" || edge.Host is null) return new HttpTarget("none", [], null, null);
        var scheme = (edge.Scheme ?? "http").ToLowerInvariant();
        var port = edge.Port ?? (scheme == "https" ? 443 : 80);

        var named = index.Bindings
            .Where(b => b.Protocol == scheme && b.Port == port && string.Equals(b.HostHeader, edge.Host, StringComparison.OrdinalIgnoreCase))
            .Select(b => (b.Machine, b.Site))
            .Distinct(SiteKeyComparer.Instance)
            .ToList();
        if (named.Count > 0)
        {
            var sites = named.Select(n => (n.Machine, n.Site, AppPathFor(index, n.Machine, n.Site, edge.Path))).ToList();
            var where = string.Join(", ", sites.Select(t => $"{t.Machine} · {t.Site} · {t.Item3}"));
            return new HttpTarget("site", sites, null,
                sites.Count == 1 ? $"bound on {where}" : $"bound on {sites.Count} machines — {where}; a farm may survive one going down");
        }

        string machine;
        if (edge.IsLocal) machine = sourceMachine;
        else if (index.Ambiguous.Contains(edge.Host))
            return new HttpTarget("ambiguous", [], null, $"'{edge.Host}' is claimed by more than one censused machine, so it cannot be resolved");
        else if (index.ByName.TryGetValue(edge.Host, out var known)) machine = known.Machine;
        else return new HttpTarget("none", [], null, null);
        if (machine is null) return new HttpTarget("none", [], null, null);

        var status = index.IisStatus.GetValueOrDefault(machine, "not-collected");
        if (status != "ok")
            return new HttpTarget("machine", [], machine, $"{machine}'s IIS collector reported '{status}', so which site answers {scheme}:{port} is unknown");

        var catchAll = index.Bindings
            .Where(b => b.Protocol == scheme && b.Port == port && b.HostHeader.Length == 0
                && string.Equals(b.Machine, machine, StringComparison.OrdinalIgnoreCase))
            .Select(b => b.Site)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (catchAll.Count == 1)
        {
            var path = AppPathFor(index, machine, catchAll[0], edge.Path);
            return new HttpTarget("site", [(machine, catchAll[0], path)], null, $"answered by {machine} · {catchAll[0]} · {path} (no host name on the binding)");
        }
        if (catchAll.Count > 1)
            return new HttpTarget("ambiguous", [], machine, $"{catchAll.Count} sites on {machine} bind {scheme}:{port} with no host name — census cannot tell which answers");
        return new HttpTarget("machine", [], machine, $"no IIS site on {machine} binds {scheme}:{port} — something other than IIS may listen there");
    }

    /// <summary>IIS application routing: the longest application path that prefixes the URL path at a segment boundary.</summary>
    private static string AppPathFor(HostIndex index, string machine, string site, string urlPath)
    {
        var path = string.IsNullOrEmpty(urlPath) ? "/" : urlPath;
        var apps = index.AppPaths.GetValueOrDefault((machine, site)) ?? [];
        return apps
            .Where(a => a == "/" || path.Equals(a, StringComparison.OrdinalIgnoreCase)
                || path.StartsWith(a.TrimEnd('/') + "/", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(a => a.Length)
            .FirstOrDefault() ?? "/";
    }

    private static void Claim(Dictionary<string, List<MachineSql>> claims, string name, MachineSql entry)
    {
        if (!claims.TryGetValue(name, out var list)) claims[name] = list = [];
        if (!list.Any(e => string.Equals(e.Machine, entry.Machine, StringComparison.OrdinalIgnoreCase)))
            list.Add(entry);
    }

    /// <summary>An http edge's verdict (census-web.md §13.2): a binding match is confirmed; anything else is unobserved, never contradicted — a non-IIS listener is possible.</summary>
    public static (string Verdict, string Detail) CorroborateHttp(IisDependency edge, string sourceMachine, HostIndex index)
    {
        var target = ResolveHttp(edge, sourceMachine, index);
        return (target.Status == "site" ? "confirmed" : "unobserved", target.Detail);
    }

    public static (string Verdict, string Detail) Corroborate(IisDependency edge, HostIndex index)
    {
        if (edge.Kind == "http") return CorroborateHttp(edge, null, index);
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
