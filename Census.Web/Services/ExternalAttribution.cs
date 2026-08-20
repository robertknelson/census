using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Census;
using Census.Web.Models.DeclaredEntities;

namespace Census.Web.Services;

/// <summary>
/// The exact-match join between observed edge targets and declared endpoint identifiers
/// (declared-entities.md §4). Estate machines always win: only edges resolving to no
/// machine are candidates. No substring match, no wildcard, no DNS — an identifier is a
/// human assertion and is matched exactly or not at all. Default http/https ports are
/// protocol facts, not conventions, so 80/443 normalize; nothing else is inferred.
/// </summary>
public static class ExternalAttribution
{
    public record SourceEdge(string Machine, string SiteName, string AppPath, string Name, string Kind, string SourceFile, string Target, string Database);

    public record IdentifierMatch(string Identifier, string ShadowsMachine, List<SourceEdge> Edges);

    public record EntityAttribution(string Name, DeclaredEntity Entity, List<IdentifierMatch> Identifiers)
    {
        public List<SourceEdge> AllEdges => Identifiers.SelectMany(i => i.Edges)
            .DistinctBy(e => (e.Machine.ToLowerInvariant(), e.SiteName?.ToLowerInvariant(), e.AppPath?.ToLowerInvariant(), e.Name?.ToLowerInvariant(), e.Target.ToLowerInvariant()))
            .ToList();
    }

    public record UnresolvedEndpoint(string Kind, string Target, List<SourceEdge> Edges);

    public record Result(List<EntityAttribution> Entities, List<UnresolvedEndpoint> Unresolved);

    public static Result Compute(List<(string Machine, CensusEnvelope Envelope)> snapshots, DeclaredEntitiesConfig config, HostResolver.HostIndex index)
    {
        // Every observed edge whose target is not an estate machine, normalized once.
        var candidates = new List<(SourceEdge Edge, string Host, int? Port, string Scheme)>();
        foreach (var (machine, envelope) in snapshots)
        {
            if (envelope.Iis?.Status != "ok") continue;
            foreach (var edge in envelope.Iis.Data?.Dependencies ?? [])
            {
                if (edge.Host is null || edge.IsLocal) continue;
                if (edge.Kind != "database" && edge.Kind != "http") continue;
                if (index.ByName.ContainsKey(edge.Host) || index.Ambiguous.Contains(edge.Host)) continue;

                var scheme = edge.Kind == "http" ? (edge.Scheme ?? "http").ToLowerInvariant() : null;
                var port = edge.Kind == "http" ? NormalizeHttpPort(scheme, edge.Port) : edge.Port;
                var target = edge.Kind == "http"
                    ? $"{scheme}://{edge.Host.ToLowerInvariant()}{(port is null ? "" : ":" + port)}"
                    : $"{edge.Host.ToLowerInvariant()}{(port is null ? "" : ":" + port)}";
                candidates.Add((new SourceEdge(machine, edge.SiteName, edge.AppPath, edge.Name, edge.Kind, edge.SourceFile, target, edge.Database), edge.Host, port, scheme));
            }
        }

        var attributed = new HashSet<SourceEdge>();
        var entities = new List<EntityAttribution>();
        foreach (var (name, entity) in config.External.OrderBy(e => e.Key, StringComparer.OrdinalIgnoreCase))
        {
            var matches = new List<IdentifierMatch>();
            foreach (var identifier in entity.Endpoints ?? [])
            {
                var parsed = ParseIdentifier(identifier);

                // A declared identifier that names an estate machine changes nothing —
                // the machine won already — and surfaces as a config smell in the panel.
                if (index.ByName.TryGetValue(parsed.Host, out var shadowed))
                {
                    matches.Add(new IdentifierMatch(identifier, shadowed.Machine, []));
                    continue;
                }
                if (index.Ambiguous.Contains(parsed.Host))
                {
                    matches.Add(new IdentifierMatch(identifier, "(ambiguous name)", []));
                    continue;
                }

                var edges = candidates.Where(c => Matches(parsed, c.Host, c.Port, c.Scheme)).Select(c => c.Edge).ToList();
                edges.ForEach(e => attributed.Add(e));
                matches.Add(new IdentifierMatch(identifier, null, edges));
            }
            entities.Add(new EntityAttribution(name, entity, matches));
        }

        var unresolved = candidates
            .Where(c => !attributed.Contains(c.Edge))
            .GroupBy(c => (c.Edge.Kind, Target: c.Edge.Target.ToLowerInvariant()))
            .Select(g => new UnresolvedEndpoint(g.Key.Kind, g.First().Edge.Target, g.Select(c => c.Edge).ToList()))
            .OrderBy(u => u.Target, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new Result(entities, unresolved);
    }

    private record ParsedIdentifier(string Kind, string Scheme, string Host, int? Port);

    /// <summary>
    /// "scheme://host[:port]" matches http edges; "host[:port]" matches database edges.
    /// A port left off means any port (declared-entities.md §10.7); a port written means
    /// only that port.
    /// </summary>
    private static ParsedIdentifier ParseIdentifier(string identifier)
    {
        var value = identifier.Trim();
        var schemeSplit = value.Split("://", 2);
        if (schemeSplit.Length == 2)
        {
            var scheme = schemeSplit[0].ToLowerInvariant();
            var rest = schemeSplit[1].TrimEnd('/');
            var (host, port) = SplitHostPort(rest);
            return new ParsedIdentifier("http", scheme, host, NormalizeHttpPort(scheme, port));
        }
        var (dbHost, dbPort) = SplitHostPort(value);
        return new ParsedIdentifier("database", null, dbHost, dbPort);
    }

    private static (string Host, int? Port) SplitHostPort(string value)
    {
        var idx = value.LastIndexOf(':');
        if (idx > 0 && int.TryParse(value[(idx + 1)..], out var port)) return (value[..idx], port);
        return (value, null);
    }

    /// <summary>80/http and 443/https are the protocol's own defaults — an explicit :443 and no port are the same statement.</summary>
    private static int? NormalizeHttpPort(string scheme, int? port) =>
        port is null ? null
        : (scheme == "http" && port == 80) || (scheme == "https" && port == 443) ? null
        : port;

    private static bool Matches(ParsedIdentifier id, string host, int? port, string scheme)
    {
        if (!string.Equals(id.Host, host, StringComparison.OrdinalIgnoreCase)) return false;
        if (id.Kind == "http")
        {
            if (scheme is null || !string.Equals(id.Scheme, scheme, StringComparison.OrdinalIgnoreCase)) return false;
        }
        else if (scheme is not null) return false;
        // No port on the identifier matches any port; a written port matches only itself —
        // and an edge naming no port is matched only by an identifier naming none (or the
        // protocol default, which normalized away above).
        return id.Port is null || id.Port == port;
    }
}
