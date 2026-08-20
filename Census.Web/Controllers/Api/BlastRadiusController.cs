using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models;
using Census.Web.Models.Api;
using Census.Web.Models.Census;
using Census.Web.Models.DeclaredEntities;
using Census.Web.Models.EntityTags;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

/// <summary>
/// "If this machine goes down, what breaks?" (blast-radius.md). Two ways into the blast:
/// hosted on the subject, or an observed database edge from elsewhere resolving to it. One
/// hop is the transitive closure today — nothing observed depends on an application.
/// </summary>
[ApiController]
[Route("api/blast-radius")]
public class BlastRadiusController(CensusStore censusStore, EntityTagsStore entityTagsStore, DeclaredEntitiesStore declaredEntitiesStore, EntityTagsEvaluator entityTagsEvaluator) : ControllerBase
{
    [HttpGet("{machine}")]
    public ActionResult<BlastRadiusDto> Get(string machine)
    {
        var snapshots = new List<(string Machine, CensusEnvelope Envelope)>();
        foreach (var dir in censusStore.GetMachineDirs())
        {
            var envelope = censusStore.GetLatestSnapshot(dir);
            if (envelope is not null) snapshots.Add((dir, envelope));
        }

        var subject = snapshots.FirstOrDefault(s => string.Equals(s.Machine, machine, StringComparison.OrdinalIgnoreCase));
        if (subject.Envelope is null) return NotFound();

        var config = entityTagsStore.Load();
        var declaredConfig = declaredEntitiesStore.Load();
        var hosted = BuildHosted(subject.Machine, subject.Envelope, config, declaredConfig);
        var (dependents, contradicted) = BuildDependents(subject.Machine, snapshots, config);

        // Deployments keyed by (system, stage); an axis nobody asserted is "" and renders as
        // such — the answer never invents a value to fill a hole.
        var deployments = new Dictionary<(string System, string Stage), BlastDeploymentDto>();
        BlastDeploymentDto Deployment(string system, string stage)
        {
            var key = (system.ToLowerInvariant(), stage.ToLowerInvariant());
            if (!deployments.TryGetValue(key, out var d))
                deployments[key] = d = new BlastDeploymentDto { System = system, Stage = stage };
            return d;
        }

        // Deployment lines come from the associations, never a cross-product across them
        // (entity-associations.md §4): MyFancy at dev+val and Other at val yields exactly
        // three lines, and the Other×dev nobody asserted does not exist.
        var unclassifiedHosted = new List<BlastHostedDto>();
        foreach (var h in hosted)
        {
            if (h.Serves.Count == 0) { unclassifiedHosted.Add(h); continue; }
            foreach (var (system, stage) in DtoPairs(h.Serves)) Deployment(system, stage).Hosted.Add(h);
        }

        var unclassifiedDependents = new List<BlastDependentDto>();
        foreach (var d in dependents)
        {
            if (d.Serves.Count == 0) { unclassifiedDependents.Add(d); continue; }
            foreach (var (system, stage) in DtoPairs(d.Serves)) Deployment(system, stage).Dependents.Add(d);
        }

        return Ok(new BlastRadiusDto
        {
            Machine = subject.Machine,
            Deployments = deployments.Values
                .OrderBy(d => d.System, StringComparer.OrdinalIgnoreCase)
                .ThenBy(d => d.Stage, StringComparer.OrdinalIgnoreCase)
                .ToList(),
            UnclassifiedHosted = unclassifiedHosted,
            UnclassifiedDependents = unclassifiedDependents,
            Contradicted = contradicted,
            Unknowns = entityTagsEvaluator.Evaluate(subject.Machine, subject.Envelope, config, declaredConfig).Unknown,
        });
    }

    // "The partner API dies — what breaks?" (declared-entities.md §7): dependents are
    // applications whose observed edges attribute to the entity's declared identifiers.
    // Nothing observed is hosted *on* an external entity, and no edge into one can be
    // corroborated — the target exists on the human's word, so every edge says "declared".
    [HttpGet("external/{name}")]
    public ActionResult<BlastRadiusDto> GetExternal(string name)
    {
        var declaredConfig = declaredEntitiesStore.Load();
        var entityName = declaredConfig.External.Keys.FirstOrDefault(k => string.Equals(k, name, StringComparison.OrdinalIgnoreCase));
        if (entityName is null) return NotFound();
        var entity = declaredConfig.External[entityName];

        var snapshots = new List<(string Machine, CensusEnvelope Envelope)>();
        foreach (var dir in censusStore.GetMachineDirs())
        {
            var envelope = censusStore.GetLatestSnapshot(dir);
            if (envelope is not null) snapshots.Add((dir, envelope));
        }

        var config = entityTagsStore.Load();
        var attribution = ExternalAttribution.Compute(snapshots, declaredConfig, HostResolver.BuildIndex(snapshots));
        var mine = attribution.Entities.First(e => string.Equals(e.Name, entityName, StringComparison.OrdinalIgnoreCase));

        var dependents = mine.AllEdges
            .GroupBy(e => (Machine: e.Machine, Site: e.SiteName ?? "", Path: e.AppPath ?? ""))
            .OrderBy(g => g.Key.Machine, StringComparer.OrdinalIgnoreCase)
            .ThenBy(g => g.Key.Site, StringComparer.OrdinalIgnoreCase)
            .ThenBy(g => g.Key.Path, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var assertion = EntityTagsEvaluator.AssertionFor(config.Applications, g.Key.Machine, g.Key.Site, g.Key.Path);
                var serves = ServesOf(assertion);
                return new BlastDependentDto
                {
                    Machine = g.Key.Machine,
                    SiteName = g.Key.Site,
                    AppPath = g.Key.Path,
                    Serves = EntityTagsEvaluator.ToDtos(serves),
                    System = Associations.SystemsOf(serves),
                    Stage = Associations.StagesOf(serves),
                    Edges = g.Select(e => new BlastEdgeDto
                    {
                        Name = e.Name,
                        Database = e.Database,
                        SourceFile = e.SourceFile,
                        Verdict = "declared",
                        Detail = $"target {e.Target} — declared, never corroborated",
                    }).ToList(),
                };
            })
            .ToList();

        var deployments = new Dictionary<(string System, string Stage), BlastDeploymentDto>();
        var unclassifiedDependents = new List<BlastDependentDto>();
        foreach (var d in dependents)
        {
            if (d.Serves.Count == 0) { unclassifiedDependents.Add(d); continue; }
            foreach (var (system, stage) in DtoPairs(d.Serves))
            {
                var key = (system.ToLowerInvariant(), stage.ToLowerInvariant());
                if (!deployments.TryGetValue(key, out var dep))
                    deployments[key] = dep = new BlastDeploymentDto { System = system, Stage = stage };
                dep.Dependents.Add(d);
            }
        }

        // An edge to this entity can only be seen where IIS was collected — machines it
        // was not are unknown, not clean, and the answer says so.
        var unknowns = snapshots
            .Where(s => (s.Envelope.Iis?.Status ?? EntityTagsEvaluator.StatusNotCollected) is not ("ok" or "not-present"))
            .Select(s => new UnknownScopeDto { Kind = "iis", Container = s.Machine, Status = s.Envelope.Iis?.Status ?? EntityTagsEvaluator.StatusNotCollected })
            .ToList();

        return Ok(new BlastRadiusDto
        {
            Machine = entityName,
            SubjectKind = "external",
            SubjectEntityKind = entity.Kind,
            SubjectSystem = Associations.SystemsOf(Associations.Of(entity.Serves, entity.System, entity.Stage, entity.AssertedBy, entity.AssertedAt)),
            SubjectStage = Associations.StagesOf(Associations.Of(entity.Serves, entity.System, entity.Stage, entity.AssertedBy, entity.AssertedAt)),
            Deployments = deployments.Values
                .OrderBy(d => d.System, StringComparer.OrdinalIgnoreCase)
                .ThenBy(d => d.Stage, StringComparer.OrdinalIgnoreCase)
                .ToList(),
            UnclassifiedDependents = unclassifiedDependents,
            Unknowns = unknowns,
        });
    }

    /// <summary>Each association's own (system × stages) pairs — empty stages pair as (system, "").</summary>
    private static IEnumerable<(string System, string Stage)> DtoPairs(List<AssociationDto> serves) =>
        serves.SelectMany(a => (a.Stages is { Count: > 0 } ? a.Stages : new List<string> { "" }).Select(s => (a.System ?? "", s)));

    private static List<SystemAssociation> ServesOf(EntityTagAssertion assertion) =>
        assertion is null ? [] : Associations.Of(assertion.Serves, assertion.System, assertion.Stage, assertion.AssertedBy, assertion.AssertedAt);

    private static List<BlastHostedDto> BuildHosted(string machine, CensusEnvelope envelope, EntityTagsConfig config, DeclaredEntitiesConfig declaredConfig)
    {
        var hosted = new List<BlastHostedDto>();

        // Declared entities anchored here go down with the box like anything observed on it
        // (declared-entities.md §7) — marked declared so the asserted seam survives into the
        // answer. Never corroborated: existence is the assertion.
        if (declaredConfig.OnMachines.TryGetValue(machine, out var declaredHere))
        {
            foreach (var (name, entity) in declaredHere.OrderBy(e => e.Key, StringComparer.OrdinalIgnoreCase))
            {
                var serves = Associations.Of(entity.Serves, entity.System, entity.Stage, entity.AssertedBy, entity.AssertedAt);
                hosted.Add(new BlastHostedDto
                {
                    Kind = entity.Kind ?? "declared",
                    Container = "",
                    Name = name,
                    Serves = EntityTagsEvaluator.ToDtos(serves),
                    System = Associations.SystemsOf(serves),
                    Stage = Associations.StagesOf(serves),
                    Declared = true,
                });
            }
        }

        if (envelope.SqlServer?.Status == "ok")
        {
            foreach (var instance in envelope.SqlServer.Data?.Instances ?? [])
            {
                if (instance.ConnectedStatus != "ok") continue;
                foreach (var db in instance.Databases.Where(d => d.DatabaseId is null or > 4))
                {
                    var assertion = EntityTagsEvaluator.AssertionFor(config.Databases, machine, instance.InstanceName, db.Name);
                    var serves = ServesOf(assertion);
                    hosted.Add(new BlastHostedDto
                    {
                        Kind = "database",
                        Container = instance.InstanceName ?? "",
                        Name = db.Name,
                        Serves = EntityTagsEvaluator.ToDtos(serves),
                        System = Associations.SystemsOf(serves),
                        Stage = Associations.StagesOf(serves),
                    });
                }
            }
        }

        if (envelope.Iis?.Status == "ok")
        {
            foreach (var app in envelope.Iis.Data?.Applications ?? [])
            {
                var assertion = EntityTagsEvaluator.AssertionFor(config.Applications, machine, app.SiteName, app.Path);
                var serves = ServesOf(assertion);
                hosted.Add(new BlastHostedDto
                {
                    Kind = "application",
                    Container = app.SiteName ?? "",
                    Name = app.Path ?? "",
                    Serves = EntityTagsEvaluator.ToDtos(serves),
                    System = Associations.SystemsOf(serves),
                    Stage = Associations.StagesOf(serves),
                });
            }
        }

        return hosted;
    }

    private static (List<BlastDependentDto> Dependents, List<BlastDependentDto> Contradicted) BuildDependents(
        string subject, List<(string Machine, CensusEnvelope Envelope)> snapshots, EntityTagsConfig config)
    {
        var index = HostResolver.BuildIndex(snapshots);
        var byApp = new Dictionary<(string Machine, string Site, string Path), List<BlastEdgeDto>>();

        foreach (var (machine, envelope) in snapshots)
        {
            // An app on the subject pointing at the subject is already inside the blast.
            if (string.Equals(machine, subject, StringComparison.OrdinalIgnoreCase)) continue;
            if (envelope.Iis?.Status != "ok") continue;

            foreach (var edge in envelope.Iis.Data?.Dependencies ?? [])
            {
                if (edge.Kind != "database" || edge.Host is null) continue;
                // An ambiguous name cannot be attributed to the subject — dropping only
                // understates, per H-5.
                if (index.Ambiguous.Contains(edge.Host)) continue;
                if (!index.ByName.TryGetValue(edge.Host, out var target)) continue;
                if (!string.Equals(target.Machine, subject, StringComparison.OrdinalIgnoreCase)) continue;

                var (verdict, detail) = HostResolver.Corroborate(edge, index);
                var key = (machine, edge.SiteName ?? "", edge.AppPath ?? "");
                if (!byApp.TryGetValue(key, out var edges)) byApp[key] = edges = [];
                edges.Add(new BlastEdgeDto
                {
                    Name = edge.Name,
                    Database = edge.Database,
                    Instance = edge.Instance,
                    SourceFile = edge.SourceFile,
                    Verdict = verdict,
                    Detail = detail,
                });
            }
        }

        var dependents = new List<BlastDependentDto>();
        var contradicted = new List<BlastDependentDto>();
        foreach (var ((machine, site, path), edges) in byApp.OrderBy(kv => kv.Key.Machine, StringComparer.OrdinalIgnoreCase)
            .ThenBy(kv => kv.Key.Site, StringComparer.OrdinalIgnoreCase).ThenBy(kv => kv.Key.Path, StringComparer.OrdinalIgnoreCase))
        {
            var assertion = EntityTagsEvaluator.AssertionFor(config.Applications, machine, site, path);
            var serves = ServesOf(assertion);
            var dto = new BlastDependentDto
            {
                Machine = machine,
                SiteName = site,
                AppPath = path,
                Serves = EntityTagsEvaluator.ToDtos(serves),
                System = Associations.SystemsOf(serves),
                Stage = Associations.StagesOf(serves),
                Edges = edges,
            };
            // Only every-edge-contradicted is drift-not-impact: one live edge into the
            // subject is enough to break the app when the subject dies.
            if (edges.All(e => e.Verdict == "contradicted")) contradicted.Add(dto);
            else dependents.Add(dto);
        }
        return (dependents, contradicted);
    }
}
