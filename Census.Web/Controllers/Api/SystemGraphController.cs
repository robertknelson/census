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

    /// <summary>The stage crossing reading (stage-crossings.md §2): null = the ends share a stage; down | up | mixed | unordered.</summary>
    public string Crossing { get; init; }
    /// <summary>asserted — both ends' own associations; derived — the target judged on its machine's effective stage.</summary>
    public string CrossingBasis { get; init; }
    public List<string> CallerStages { get; init; } = [];
    public List<string> TargetStages { get; init; } = [];
    /// <summary>An end had no stage to compare — said, counted, never silent.</summary>
    public bool Unjudged { get; init; }
    /// <summary>A human said this crossing is meant (stage-crossings.md §4) — still drawn, out of the findings.</summary>
    public AcceptedCrossingDto Accepted { get; init; }
}

public record AcceptedCrossingDto
{
    public string By { get; init; }
    public string At { get; init; }
    public string Note { get; init; }
}

public record SystemGraphDto
{
    public required string System { get; init; }
    public List<SystemGraphNodeDto> Nodes { get; init; } = [];
    public List<SystemGraphEdgeDto> Edges { get; init; } = [];

    /// <summary>Stages the members claim — the filter chips. Filtering is client-side; ghosting, never hiding.</summary>
    public List<string> Stages { get; init; } = [];

    /// <summary>Crossing edges not accepted, and edges an unstaged end left unjudged — the toolbar's figures.</summary>
    public int Crossings { get; init; }
    public int UnjudgedEdges { get; init; }
}

/// <summary>
/// One system's dependency graph, server-composed (system-view.md §2): members by
/// association, edges by observation and attribution, neighbors and phantoms stated
/// rather than dropped. All stages returned — the client filters by ghosting.
/// </summary>
[ApiController]
[Route("api/system-graph")]
public class SystemGraphController(CensusStore censusStore, EntityTagsStore entityTagsStore, DeclaredEntitiesStore declaredEntitiesStore, GraphComposer graphComposer) : ControllerBase
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

        // The estate graph is composed once for every reader (GraphComposer); this view
        // layers membership on and prunes to its scope.
        var estate = graphComposer.Compose(snapshots, entityTagsStore.Load(), declaredEntitiesStore.Load());
        var nodes = estate.ForSystem(system);
        var edges = estate.Edges;

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
            var id = GraphComposer.NodeId("canonical", system.ToLowerInvariant(), group.Key.ToLowerInvariant());
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
                // The loudest crossing reading survives the merge (stage-crossings.md §7.3).
                var loudest = g.OrderBy(e => StageCrossing.Rank(e.Crossing)).ThenBy(e => e.Accepted is null ? 0 : 1).First();
                var merged = g.Count() == 1 ? g.First()
                    : loudest with
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
            Crossings = finalEdges.Count(e => e.Crossing is not null && e.Accepted is null),
            UnjudgedEdges = finalEdges.Count(e => e.Unjudged),
        });
    }
}
