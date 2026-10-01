using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Census.Web.Models;
using Census.Web.Models.Api;
using Census.Web.Models.Census;
using Census.Web.Models.EntityTags;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

public record SystemGraphNodeDto
{
    public required string Id { get; init; }
    public required string Kind { get; init; }        // database | application | endpoint | a declared kind
    public required string Name { get; init; }
    public string Container { get; init; }            // instance | site
    public string Machine { get; init; }              // null for external entities and raw endpoints
    public bool Declared { get; init; }
    public bool External { get; init; }

    /// <summary>Claims the viewed system — the graph's members.</summary>
    public bool Member { get; init; }

    /// <summary>Touched by a member's edge but claiming nothing — the pile leaking into the answer, shown.</summary>
    public bool Unclassified { get; init; }

    /// <summary>Claims other systems only — rendered as a neighbor with its allegiances visible.</summary>
    public bool OffSystem { get; init; }

    /// <summary>An edge target census could not observe at its address — exists only as the edge's claim.</summary>
    public bool Phantom { get; init; }

    /// <summary>Groups stage variants sharing this system's canonical name (canonical-names.md §4).</summary>
    public bool Canonical { get; init; }

    /// <summary>Distinct machines hosting the collapsed variants — the sublabel when Machine is null.</summary>
    public List<string> Hosts { get; init; } = [];

    /// <summary>The concrete variants collapsed into a canonical node — the clean label is one click from the evidence.</summary>
    public List<CanonicalVariantDto> Variants { get; init; } = [];

    public List<AssociationDto> Serves { get; init; } = [];
    public string Note { get; init; }
}

public record CanonicalVariantDto
{
    public required string Kind { get; init; }
    public required string Name { get; init; }
    public string Container { get; init; }
    public string Machine { get; init; }
    public bool Declared { get; init; }
    public bool Phantom { get; init; }
    public List<string> Stages { get; init; } = [];
    public string AssertedBy { get; init; }
    public string AssertedAt { get; init; }
}

public record SystemGraphEdgeDto
{
    public required string SourceId { get; init; }
    public required string TargetId { get; init; }
    public string Name { get; init; }
    public required string Kind { get; init; }        // database | external | unresolved
    public required string Verdict { get; init; }     // confirmed | contradicted | unobserved | declared | unresolved
    public string Detail { get; init; }
    public string SourceFile { get; init; }
}

public record SystemGraphDto
{
    public required string System { get; init; }
    public List<SystemGraphNodeDto> Nodes { get; init; } = [];
    public List<SystemGraphEdgeDto> Edges { get; init; } = [];

    /// <summary>Stages the members claim — the filter chips. Filtering is client-side; ghosting, never hiding.</summary>
    public List<string> Stages { get; init; } = [];
}

/// <summary>
/// One system's dependency graph, server-composed (system-view.md §2): members by
/// association, edges by observation and attribution, neighbors and phantoms stated
/// rather than dropped. All stages returned — the client filters by ghosting.
/// </summary>
[ApiController]
[Route("api/system-graph")]
public class SystemGraphController(CensusStore censusStore, EntityTagsStore entityTagsStore, DeclaredEntitiesStore declaredEntitiesStore) : ControllerBase
{
    /// <param name="grouping">canonical (default) collapses stage variants sharing a canonical
    /// name; observed leaves every entity as its own node — the canonical name stays a fact
    /// on the association, and the collapse becomes the view's choice (system-view.md §3).</param>
    [HttpGet("{system}")]
    public ActionResult<SystemGraphDto> Get(string system, [FromQuery] string grouping = "canonical")
    {
        var snapshots = new List<(string Machine, CensusEnvelope Envelope)>();
        foreach (var dir in censusStore.GetMachineDirs())
        {
            var envelope = censusStore.GetLatestSnapshot(dir);
            if (envelope is not null) snapshots.Add((dir, envelope));
        }

        var tags = entityTagsStore.Load();
        var declared = declaredEntitiesStore.Load();
        var index = HostResolver.BuildIndex(snapshots);
        var attribution = ExternalAttribution.Compute(snapshots, declared, index);

        var nodes = new Dictionary<string, SystemGraphNodeDto>(StringComparer.Ordinal);
        var edges = new List<SystemGraphEdgeDto>();

        bool ClaimsSystem(List<SystemAssociation> serves) =>
            serves.Any(a => string.Equals(a.System, system, StringComparison.OrdinalIgnoreCase));

        SystemGraphNodeDto AddNode(SystemGraphNodeDto node)
        {
            if (!nodes.TryGetValue(node.Id, out var existing)) nodes[node.Id] = existing = node;
            return existing;
        }

        SystemGraphNodeDto EntityNode(string id, string kind, string name, string container, string machine, bool isDeclared, bool isExternal, List<SystemAssociation> serves, string note = null, bool phantom = false)
        {
            var member = ClaimsSystem(serves);
            return AddNode(new SystemGraphNodeDto
            {
                Id = id,
                Kind = kind,
                Name = name,
                Container = container,
                Machine = machine,
                Declared = isDeclared,
                External = isExternal,
                Member = member,
                Unclassified = !member && serves.Count == 0 && !phantom,
                OffSystem = !member && serves.Count > 0,
                Phantom = phantom,
                Serves = EntityTagsEvaluator.ToDtos(serves),
                Note = note,
            });
        }

        // Observed entities. Nodes for every collected database and application — pruned to
        // members-plus-touched at the end, so membership never has to be known up front.
        foreach (var (machine, envelope) in snapshots)
        {
            if (envelope.SqlServer?.Status == "ok")
            {
                foreach (var instance in envelope.SqlServer.Data?.Instances ?? [])
                {
                    if (instance.ConnectedStatus != "ok") continue;
                    foreach (var db in instance.Databases.Where(d => d.DatabaseId is null or > 4))
                    {
                        var leaf = EntityTagsEvaluator.AssertionFor(tags.Databases, machine, instance.InstanceName, db.Name);
                        EntityNode(NodeId("database", machine, instance.InstanceName ?? "", db.Name), "database", db.Name, instance.InstanceName, machine, false, false, ServesOf(leaf));
                    }
                }
            }
            if (envelope.Iis?.Status == "ok")
            {
                foreach (var app in envelope.Iis.Data?.Applications ?? [])
                {
                    var leaf = EntityTagsEvaluator.AssertionFor(tags.Applications, machine, app.SiteName, app.Path);
                    EntityNode(NodeId("application", machine, app.SiteName ?? "", app.Path ?? ""), "application", $"{app.SiteName}{app.Path}", app.SiteName, machine, false, false, ServesOf(leaf));
                }
            }
        }

        foreach (var (machine, entities) in declared.OnMachines)
        {
            foreach (var (name, entity) in entities)
            {
                EntityNode(NodeId("declared", machine, name), entity.Kind ?? "declared", name, null, machine, true, false,
                    Associations.Of(entity.Serves, entity.System, entity.Stage, entity.AssertedBy, entity.AssertedAt), entity.Note);
            }
        }
        foreach (var (name, entity) in declared.External)
        {
            EntityNode(NodeId("external", name), entity.Kind ?? "external", name, null, null, true, true,
                Associations.Of(entity.Serves, entity.System, entity.Stage, entity.AssertedBy, entity.AssertedAt), entity.Note);
        }

        // Observed database edges, resolved without guessing: ambiguous names dropped (H-5),
        // resolved-but-absent targets become phantoms — the edge's claim, visibly unbacked.
        foreach (var (machine, envelope) in snapshots)
        {
            if (envelope.Iis?.Status != "ok") continue;
            foreach (var edge in envelope.Iis.Data?.Dependencies ?? [])
            {
                if (edge.Kind != "database" || edge.Host is null) continue;
                if (index.Ambiguous.Contains(edge.Host)) continue;
                if (!index.ByName.TryGetValue(edge.Host, out var target)) continue;

                var sourceId = NodeId("application", machine, edge.SiteName ?? "", edge.AppPath ?? "");
                if (!nodes.ContainsKey(sourceId)) continue;

                var (verdict, detail) = HostResolver.Corroborate(edge, index);
                var instanceName = ResolveInstance(target, edge);
                var targetId = NodeId("database", target.Machine, instanceName ?? edge.Instance ?? "", edge.Database ?? "");
                if (!nodes.ContainsKey(targetId))
                {
                    var leaf = EntityTagsEvaluator.AssertionFor(tags.Databases, target.Machine, instanceName ?? edge.Instance, edge.Database);
                    EntityNode(targetId, "database", edge.Database ?? "?", instanceName ?? edge.Instance, target.Machine, false, false, ServesOf(leaf), phantom: true);
                }
                edges.Add(new SystemGraphEdgeDto
                {
                    SourceId = sourceId,
                    TargetId = targetId,
                    Name = edge.Name,
                    Kind = "database",
                    Verdict = verdict,
                    Detail = detail,
                    SourceFile = edge.SourceFile,
                });
            }
        }

        // Web addresses resolved through IIS bindings (census-web.md §13): to the application
        // that answers, which carries its own serves — another system's site reads as
        // off-system. A known machine with no answering site ends at an endpoint on it.
        foreach (var (machine, envelope) in snapshots)
        {
            if (envelope.Iis?.Status != "ok") continue;
            foreach (var edge in envelope.Iis.Data?.Dependencies ?? [])
            {
                if (edge.Kind != "http") continue;
                var sourceId = NodeId("application", machine, edge.SiteName ?? "", edge.AppPath ?? "");
                if (!nodes.ContainsKey(sourceId)) continue;
                var http = HostResolver.ResolveHttp(edge, machine, index);
                if (!http.InEstate) continue;

                if (http.Status == "site")
                {
                    foreach (var (tm, site, appPath) in http.Sites)
                    {
                        var targetId = NodeId("application", tm, site ?? "", appPath ?? "");
                        if (!nodes.ContainsKey(targetId))
                        {
                            var leaf = EntityTagsEvaluator.AssertionFor(tags.Applications, tm, site, appPath);
                            EntityNode(targetId, "application", $"{site}{appPath}", site, tm, false, false, ServesOf(leaf), phantom: true);
                        }
                        if (targetId == sourceId) continue;
                        edges.Add(new SystemGraphEdgeDto
                        {
                            SourceId = sourceId, TargetId = targetId, Name = edge.Name, Kind = "http",
                            Verdict = "confirmed", Detail = http.Detail, SourceFile = edge.SourceFile,
                        });
                    }
                    continue;
                }

                var label = $"{edge.Scheme}://{edge.Host}{(edge.Port is null ? "" : ":" + edge.Port)}";
                var endpointId = NodeId("endpoint", http.Machine ?? "", label);
                AddNode(new SystemGraphNodeDto
                {
                    Id = endpointId, Kind = "endpoint", Name = label, Machine = http.Machine, Note = http.Detail,
                });
                edges.Add(new SystemGraphEdgeDto
                {
                    SourceId = sourceId, TargetId = endpointId, Name = edge.Name, Kind = "http",
                    Verdict = "unobserved", Detail = http.Detail, SourceFile = edge.SourceFile,
                });
            }
        }

        // Attributed edges into external entities — declared targets, never corroborated.
        foreach (var entity in attribution.Entities)
        {
            var targetId = NodeId("external", entity.Name);
            foreach (var e in entity.AllEdges)
            {
                var sourceId = NodeId("application", e.Machine, e.SiteName ?? "", e.AppPath ?? "");
                if (!nodes.ContainsKey(sourceId)) continue;
                edges.Add(new SystemGraphEdgeDto
                {
                    SourceId = sourceId,
                    TargetId = targetId,
                    Name = e.Name,
                    Kind = "external",
                    Verdict = "declared",
                    Detail = $"target {e.Target} — declared, never corroborated",
                    SourceFile = e.SourceFile,
                });
            }
        }

        // Unresolved endpoints a member touches: raw targets, no matching, straight to Triage.
        foreach (var u in attribution.Unresolved)
        {
            var endpointId = NodeId("endpoint", u.Target);
            foreach (var e in u.Edges)
            {
                var sourceId = NodeId("application", e.Machine, e.SiteName ?? "", e.AppPath ?? "");
                if (!nodes.TryGetValue(sourceId, out var source) || !source.Member) continue;
                AddNode(new SystemGraphNodeDto
                {
                    Id = endpointId, Kind = "endpoint", Name = u.Target, Unclassified = true,
                });
                edges.Add(new SystemGraphEdgeDto
                {
                    SourceId = sourceId,
                    TargetId = endpointId,
                    Name = e.Name,
                    Kind = "unresolved",
                    Verdict = "unresolved",
                    Detail = "observed edge to no machine and no declared entity — attribute it in Triage",
                    SourceFile = e.SourceFile,
                });
            }
        }

        // The scope rule (system-view.md §2): members, plus anything a member-touching edge
        // reaches. Nothing else — but nothing touched is ever dropped.
        var kept = edges
            .Where(e => nodes[e.SourceId].Member || nodes[e.TargetId].Member)
            .ToList();
        var keptIds = new HashSet<string>(kept.SelectMany(e => new[] { e.SourceId, e.TargetId }), StringComparer.Ordinal);
        var prunedNodes = nodes.Values
            .Where(n => n.Member || keptIds.Contains(n.Id))
            .ToList();

        // Canonical grouping (canonical-names.md §4): members sharing this system's
        // canonical name collapse into one node — the clean view — with the observed
        // variants riding along for the inspector. Only an association naming the viewed
        // system carries a canonical name here, so scoping is per-system by construction.
        var collapse = !string.Equals(grouping, "observed", StringComparison.OrdinalIgnoreCase);
        string CanonicalOf(SystemGraphNodeDto n) => !collapse ? null : n.Serves
            .FirstOrDefault(a => string.Equals(a.System, system, StringComparison.OrdinalIgnoreCase)
                && !string.IsNullOrEmpty(a.CanonicalName))?.CanonicalName;

        var idMap = new Dictionary<string, string>(StringComparer.Ordinal);
        var canonicalNodes = new List<SystemGraphNodeDto>();
        foreach (var group in prunedNodes
            .Select(n => (Node: n, Canonical: CanonicalOf(n)))
            .Where(x => x.Canonical is not null)
            .GroupBy(x => x.Canonical, StringComparer.OrdinalIgnoreCase))
        {
            var variants = group.Select(x => x.Node).ToList();
            var id = NodeId("canonical", system.ToLowerInvariant(), group.Key.ToLowerInvariant());
            foreach (var v in variants) idMap[v.Id] = id;
            var hosts = variants.Select(v => v.Machine).Where(m => m is not null)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(m => m, StringComparer.OrdinalIgnoreCase).ToList();
            canonicalNodes.Add(new SystemGraphNodeDto
            {
                Id = id,
                Kind = variants[0].Kind,
                Name = group.Key,
                Machine = hosts.Count == 1 ? hosts[0] : null,
                Hosts = hosts,
                // The seam rules stay honest under grouping: the node reads as observed
                // if any variant is observed; a lone declared/phantom variant keeps its
                // own marks in the inspector's variant rows.
                Declared = variants.All(v => v.Declared),
                External = variants.All(v => v.External),
                Phantom = variants.All(v => v.Phantom),
                Member = true,
                Canonical = true,
                Serves = variants.SelectMany(v => v.Serves).ToList(),
                Variants = variants.Select(v => new CanonicalVariantDto
                {
                    Kind = v.Kind,
                    Name = v.Name,
                    Container = v.Container,
                    Machine = v.Machine,
                    Declared = v.Declared,
                    Phantom = v.Phantom,
                    Stages = v.Serves
                        .Where(a => string.Equals(a.System, system, StringComparison.OrdinalIgnoreCase))
                        .SelectMany(a => a.Stages)
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .OrderBy(s => s, StageOrder.Comparer).ToList(),
                    AssertedBy = v.Serves.FirstOrDefault(a => string.Equals(a.System, system, StringComparison.OrdinalIgnoreCase))?.AssertedBy,
                    AssertedAt = v.Serves.FirstOrDefault(a => string.Equals(a.System, system, StringComparison.OrdinalIgnoreCase))?.AssertedAt,
                }).ToList(),
            });
        }

        var finalNodes = prunedNodes
            .Where(n => !idMap.ContainsKey(n.Id))
            .Concat(canonicalNodes)
            .OrderBy(n => n.Machine ?? "~", StringComparer.OrdinalIgnoreCase)
            .ThenBy(n => n.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Edges re-point to the canonical nodes; parallel edges the collapse created merge
        // per (endpoints, kind, verdict) — verdicts never merge — with the count stated.
        // Edges the collapse never touched pass through exactly as before.
        var canonicalIds = new HashSet<string>(idMap.Values, StringComparer.Ordinal);
        var finalEdges = kept
            .Select(e => e with
            {
                SourceId = idMap.GetValueOrDefault(e.SourceId, e.SourceId),
                TargetId = idMap.GetValueOrDefault(e.TargetId, e.TargetId),
            })
            .GroupBy(e => (e.SourceId, e.TargetId, e.Kind, e.Verdict))
            .SelectMany(g =>
            {
                if (!canonicalIds.Contains(g.Key.SourceId) && !canonicalIds.Contains(g.Key.TargetId)) return g.AsEnumerable();
                var merged = g.Count() == 1 ? g.First()
                    : g.First() with
                    {
                        Detail = $"{g.Count()} observed edges under this canonical pairing"
                            + (string.IsNullOrEmpty(g.First().Detail) ? "" : $" — first: {g.First().Detail}"),
                    };
                return [merged];
            })
            .ToList();

        return Ok(new SystemGraphDto
        {
            System = system,
            Nodes = finalNodes,
            Edges = finalEdges,
            Stages = finalNodes.Where(n => n.Member)
                .SelectMany(n => n.Serves.Where(a => string.Equals(a.System, system, StringComparison.OrdinalIgnoreCase)))
                .SelectMany(a => a.Stages)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(s => s, StageOrder.Comparer)
                .ToList(),
        });
    }

    private List<SystemAssociation> ServesOf(EntityTagAssertion leaf) =>
        leaf is null ? [] : Associations.Of(leaf.Serves, leaf.System, leaf.Stage, leaf.AssertedBy, leaf.AssertedAt);

    /// <summary>The instance actually holding the database, when the edge named none — observed containment, not a guess.</summary>
    private static string ResolveInstance(HostResolver.MachineSql target, IisDependency edge)
    {
        if (!string.IsNullOrEmpty(edge.Instance)) return edge.Instance;
        if (edge.Database is null) return null;
        return target.Instances.FirstOrDefault(i => i.Databases.Contains(edge.Database)).Instance;
    }

    /// <summary>Opaque structured id — serialized parts, never a delimiter-joined string a name could break.</summary>
    private static string NodeId(params string[] parts) => JsonSerializer.Serialize(parts);
}
