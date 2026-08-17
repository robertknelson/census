using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;
using Census.Web.Models.Census;
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
public class BlastRadiusController(CensusStore censusStore, EntityTagsStore entityTagsStore, EntityTagsEvaluator entityTagsEvaluator) : ControllerBase
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
        var hosted = BuildHosted(subject.Machine, subject.Envelope, config);
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

        var unclassifiedHosted = new List<BlastHostedDto>();
        foreach (var h in hosted)
        {
            if (h.System.Count == 0 && h.Stage.Count == 0) { unclassifiedHosted.Add(h); continue; }
            foreach (var (system, stage) in Pairs(h.System, h.Stage)) Deployment(system, stage).Hosted.Add(h);
        }

        var unclassifiedDependents = new List<BlastDependentDto>();
        foreach (var d in dependents)
        {
            if (d.System.Count == 0 && d.Stage.Count == 0) { unclassifiedDependents.Add(d); continue; }
            foreach (var (system, stage) in Pairs(d.System, d.Stage)) Deployment(system, stage).Dependents.Add(d);
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
            Unknowns = entityTagsEvaluator.Evaluate(subject.Machine, subject.Envelope, config).Unknown,
        });
    }

    /// <summary>The cross-product of a contributor's axes — a shared reference database in two systems lands in both.</summary>
    private static IEnumerable<(string System, string Stage)> Pairs(List<string> systems, List<string> stages)
    {
        List<string> left = systems.Count > 0 ? systems : [""];
        List<string> right = stages.Count > 0 ? stages : [""];
        return left.SelectMany(_ => right, (system, stage) => (system, stage));
    }

    private static List<BlastHostedDto> BuildHosted(string machine, CensusEnvelope envelope, EntityTagsConfig config)
    {
        var hosted = new List<BlastHostedDto>();

        if (envelope.SqlServer?.Status == "ok")
        {
            foreach (var instance in envelope.SqlServer.Data?.Instances ?? [])
            {
                if (instance.ConnectedStatus != "ok") continue;
                foreach (var db in instance.Databases.Where(d => d.DatabaseId is null or > 4))
                {
                    var assertion = EntityTagsEvaluator.AssertionFor(config.Databases, machine, instance.InstanceName, db.Name);
                    hosted.Add(new BlastHostedDto
                    {
                        Kind = "database",
                        Container = instance.InstanceName ?? "",
                        Name = db.Name,
                        System = assertion?.System ?? [],
                        Stage = assertion?.Stage ?? [],
                    });
                }
            }
        }

        if (envelope.Iis?.Status == "ok")
        {
            foreach (var app in envelope.Iis.Data?.Applications ?? [])
            {
                var assertion = EntityTagsEvaluator.AssertionFor(config.Applications, machine, app.SiteName, app.Path);
                hosted.Add(new BlastHostedDto
                {
                    Kind = "application",
                    Container = app.SiteName ?? "",
                    Name = app.Path ?? "",
                    System = assertion?.System ?? [],
                    Stage = assertion?.Stage ?? [],
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
            var dto = new BlastDependentDto
            {
                Machine = machine,
                SiteName = site,
                AppPath = path,
                System = assertion?.System ?? [],
                Stage = assertion?.Stage ?? [],
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
