using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Census.Web.Controllers.Api;
using Census.Web.Models;
using Census.Web.Models.Api;
using Census.Web.Models.Census;
using Census.Web.Models.DeclaredEntities;
using Census.Web.Models.EntityTags;

namespace Census.Web.Services;

/// <summary>
/// The estate's entity graph, composed once for every reader (system-view.md §2; lifted out of
/// the system graph controller for stage-crossings.md §3.3): every observed and declared entity
/// as a node with its associations, every observed database and http edge resolved without
/// guessing, attributed external edges, unresolved endpoints — and on each edge the stage
/// crossing reading (stage-crossings.md §2). Membership in a viewed system is layered on by
/// <see cref="EstateGraph.ForSystem"/>; the findings engine reads the whole.
/// </summary>
public class GraphComposer(EntityTagsEvaluator entityTagsEvaluator, AssetsStore assetsStore, StageCrossingsStore stageCrossingsStore)
{
    public sealed class EstateGraph
    {
        public required Dictionary<string, SystemGraphNodeDto> Nodes { get; init; }
        public required List<SystemGraphEdgeDto> Edges { get; init; }

        /// <summary>Edge indices by the observation that produced them — hosting and blast radius look their own rows up here.</summary>
        public required Dictionary<(string Machine, string Site, string Path, string Name, string SourceFile), List<int>> ByObservation { get; init; }

        public static (string, string, string, string, string) ObservationKey(string machine, string site, string path, string name, string sourceFile) =>
            ((machine ?? "").ToLowerInvariant(), (site ?? "").ToLowerInvariant(), (path ?? "").ToLowerInvariant(), name ?? "", sourceFile ?? "");

        /// <summary>The graph edges one observed dependency produced — several for a farm target, none when it resolved nowhere.</summary>
        public List<SystemGraphEdgeDto> EdgesFor(string machine, IisDependency edge) =>
            ByObservation.TryGetValue(ObservationKey(machine, edge.SiteName, edge.AppPath, edge.Name, edge.SourceFile), out var at)
                ? at.Select(i => Edges[i]).ToList()
                : [];

        /// <summary>Nodes with membership read against one system: member, off-system, or neither.</summary>
        public Dictionary<string, SystemGraphNodeDto> ForSystem(string system)
        {
            bool Claims(SystemGraphNodeDto n) => n.Serves.Any(a => string.Equals(a.System, system, StringComparison.OrdinalIgnoreCase));
            return Nodes.ToDictionary(kv => kv.Key, kv =>
            {
                var member = Claims(kv.Value);
                return kv.Value with { Member = member, OffSystem = !member && kv.Value.Serves.Count > 0 };
            }, StringComparer.Ordinal);
        }
    }

    public EstateGraph Compose(List<(string Machine, CensusEnvelope Envelope)> snapshots, EntityTagsConfig tags, DeclaredEntitiesConfig declared)
    {
        var index = HostResolver.BuildIndex(snapshots);
        var attribution = ExternalAttribution.Compute(snapshots, declared, index);
        var nodes = new Dictionary<string, SystemGraphNodeDto>(StringComparer.Ordinal);
        var edges = new List<SystemGraphEdgeDto>();
        var byObservation = new Dictionary<(string, string, string, string, string), List<int>>();

        SystemGraphNodeDto AddNode(SystemGraphNodeDto node)
        {
            if (!nodes.TryGetValue(node.Id, out var existing)) nodes[node.Id] = existing = node;
            return existing;
        }

        SystemGraphNodeDto EntityNode(string id, string kind, string name, string container, string machine, bool isDeclared, bool isExternal, List<SystemAssociation> serves, string note = null, bool phantom = false)
        {
            return AddNode(new SystemGraphNodeDto
            {
                Id = id,
                Kind = kind,
                Name = name,
                Container = container,
                Machine = machine,
                Declared = isDeclared,
                External = isExternal,
                Unclassified = serves.Count == 0 && !phantom,
                Phantom = phantom,
                Serves = EntityTagsEvaluator.ToDtos(serves),
                Note = note,
            });
        }

        void AddEdge(string machine, string site, string path, SystemGraphEdgeDto edge)
        {
            edges.Add(edge);
            if (machine is null) return;
            var key = EstateGraph.ObservationKey(machine, site, path, edge.Name, edge.SourceFile);
            if (!byObservation.TryGetValue(key, out var list)) byObservation[key] = list = [];
            list.Add(edges.Count - 1);
        }

        // Observed entities. Nodes for every collected database and application — a viewed
        // system prunes to members-plus-touched later, so membership never has to be known here.
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
                AddEdge(machine, edge.SiteName, edge.AppPath, new SystemGraphEdgeDto
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
                        AddEdge(machine, edge.SiteName, edge.AppPath, new SystemGraphEdgeDto
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
                AddEdge(machine, edge.SiteName, edge.AppPath, new SystemGraphEdgeDto
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
                AddEdge(e.Machine, e.SiteName, e.AppPath, new SystemGraphEdgeDto
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

        // Unresolved endpoints: raw targets, no matching, straight to Triage. A viewed system
        // keeps only the ones its members touch (the scope rule prunes the rest).
        foreach (var u in attribution.Unresolved)
        {
            var endpointId = NodeId("endpoint", u.Target);
            foreach (var e in u.Edges)
            {
                var sourceId = NodeId("application", e.Machine, e.SiteName ?? "", e.AppPath ?? "");
                if (!nodes.ContainsKey(sourceId)) continue;
                AddNode(new SystemGraphNodeDto
                {
                    Id = endpointId, Kind = "endpoint", Name = u.Target, Unclassified = true,
                });
                AddEdge(null, null, null, new SystemGraphEdgeDto
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

        JudgeCrossings(snapshots, tags, declared, nodes, edges);

        return new EstateGraph { Nodes = nodes, Edges = edges, ByObservation = byObservation };
    }

    /// <summary>
    /// The crossing reading on every edge with a target that can carry a stage
    /// (stage-crossings.md §2): the caller's whole stage set against the target's; an
    /// unclassified target on a staged machine is judged on the machine's effective stage,
    /// badged derived; an end with no stage at all leaves the edge unjudged, said so.
    /// </summary>
    private void JudgeCrossings(List<(string Machine, CensusEnvelope Envelope)> snapshots, EntityTagsConfig tags, DeclaredEntitiesConfig declared,
        Dictionary<string, SystemGraphNodeDto> nodes, List<SystemGraphEdgeDto> edges)
    {
        var assets = assetsStore.Load();
        var envelopes = snapshots.ToDictionary(s => s.Machine, s => s.Envelope, StringComparer.OrdinalIgnoreCase);
        var machineStages = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        List<string> MachineStages(string machine)
        {
            if (machineStages.TryGetValue(machine, out var cached)) return cached;
            var asserted = assetsStore.FacetsFor(assets, machine).GetValueOrDefault("stage", []);
            var rollup = envelopes.TryGetValue(machine, out var envelope)
                ? entityTagsEvaluator.Evaluate(machine, envelope, tags, declared).Rollup
                : null;
            var (stages, _) = EntityTagsEvaluator.EffectiveStages(asserted, rollup);
            return machineStages[machine] = stages;
        }

        var accepted = stageCrossingsStore.Load().Accepted
            .GroupBy(a => (a.Caller, a.Target))
            .ToDictionary(g => g.Key, g => g.First());

        for (var i = 0; i < edges.Count; i++)
        {
            var edge = edges[i];
            var caller = nodes[edge.SourceId];
            var target = nodes[edge.TargetId];
            if (target.Kind == "endpoint") continue;

            var callerStages = StagesOf(caller);
            var targetStages = StagesOf(target);
            var basis = "asserted";
            if (targetStages.Count == 0 && target.Machine is not null && !target.External)
            {
                targetStages = MachineStages(target.Machine);
                if (targetStages.Count > 0) basis = "derived";
            }

            var reading = StageCrossing.Judge(callerStages, targetStages);
            var judged = edge with
            {
                CallerStages = callerStages,
                TargetStages = targetStages,
                Unjudged = reading.Unjudged,
                Crossing = reading.Direction,
                CrossingBasis = reading.Direction is null ? null : basis,
                Accepted = reading.Direction is not null && accepted.TryGetValue((edge.SourceId, edge.TargetId), out var a)
                    ? new AcceptedCrossingDto { By = a.By, At = a.At, Note = a.Note }
                    : null,
            };
            edges[i] = judged;
        }
    }

    private static List<string> StagesOf(SystemGraphNodeDto node) =>
        node.Serves.SelectMany(a => a.Stages).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(s => s, StageOrder.Comparer).ToList();

    private static List<SystemAssociation> ServesOf(EntityTagAssertion leaf) =>
        leaf is null ? [] : Associations.Of(leaf.Serves, leaf.System, leaf.Stage, leaf.AssertedBy, leaf.AssertedAt);

    /// <summary>The instance actually holding the database, when the edge named none — observed containment, not a guess.</summary>
    private static string ResolveInstance(HostResolver.MachineSql target, IisDependency edge)
    {
        if (!string.IsNullOrEmpty(edge.Instance)) return edge.Instance;
        if (edge.Database is null) return null;
        return target.Instances.FirstOrDefault(i => i.Databases.Contains(edge.Database)).Instance;
    }

    /// <summary>Opaque structured id — serialized parts, never a delimiter-joined string a name could break.</summary>
    public static string NodeId(params string[] parts) => JsonSerializer.Serialize(parts);
}
