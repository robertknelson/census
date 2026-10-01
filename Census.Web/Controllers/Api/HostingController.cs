using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;
using Census.Web.Models.Census;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

/// <summary>
/// The fleet pivoted by what it hosts rather than by machine: where an application runs, where
/// a database lives, and what depends on what. One pass over every machine's latest snapshot —
/// computing the three separately would deserialise every snapshot three times.
/// See .docs/features/census-web.md §11.
/// </summary>
[ApiController]
[Route("api/hosting")]
public class HostingController(CensusStore censusStore) : ControllerBase
{
    private static readonly string[] SystemDatabases = ["master", "model", "msdb", "tempdb"];

    [HttpGet]
    public ActionResult<HostingDto> GetHosting()
    {
        var snapshots = new List<(string Machine, CensusEnvelope Envelope)>();
        foreach (var machine in censusStore.GetMachineDirs())
        {
            var envelope = censusStore.GetLatestSnapshot(machine);
            if (envelope is not null) snapshots.Add((machine, envelope));
        }

        return Ok(new HostingDto
        {
            Applications = BuildApplications(snapshots),
            Databases = BuildDatabases(snapshots),
            Dependencies = BuildDependencies(snapshots),
        });
    }

    // Grouped on (site, path) because that is the identity that repeats across a web farm.
    // Two machines serving portal.example.com/ are the same application.
    private static List<HostedAppDto> BuildApplications(List<(string Machine, CensusEnvelope Envelope)> snapshots)
    {
        var occurrences = new List<(string Site, string Path, HostedAppInstanceDto Instance, string Runtime)>();

        foreach (var (machine, envelope) in snapshots)
        {
            if (envelope.Iis?.Status != "ok") continue;
            foreach (var app in envelope.Iis.Data?.Applications ?? [])
            {
                if (app.SiteName is null || app.Path is null) continue;
                var runtime = DescribeRuntime(app);
                occurrences.Add((app.SiteName, app.Path, new HostedAppInstanceDto
                {
                    Machine = machine,
                    Runtime = runtime,
                    AppPool = app.ApplicationPool,
                    Identity = app.PoolIdentityType == "SpecificUser" ? app.PoolUserName : app.PoolIdentityType,
                    PhysicalPath = app.PhysicalPath?.Expanded ?? app.PhysicalPath?.Raw,
                }, runtime));
            }
        }

        return occurrences
            .GroupBy(o => (o.Site, o.Path))
            .Select(g => new HostedAppDto
            {
                SiteName = g.Key.Site,
                Path = g.Key.Path,
                MachineCount = g.Select(o => o.Instance.Machine).Distinct(StringComparer.OrdinalIgnoreCase).Count(),
                Runtimes = g.Select(o => o.Runtime).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(r => r).ToList(),
                Instances = g.Select(o => o.Instance).OrderBy(i => i.Machine, StringComparer.OrdinalIgnoreCase).ToList(),
            })
            .OrderBy(a => a.SiteName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(a => a.Path, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    // The same derivation the dossier uses, kept deliberately in one place per decision W-3 -
    // the collector emits raw signals and picks no winner.
    private static string DescribeRuntime(IisApplication app)
    {
        if (app.Runtime?.AspNetCore is { } core)
            return string.IsNullOrEmpty(core.HostingModel) ? "ASP.NET Core" : $"ASP.NET Core {core.HostingModel}";
        return app.PoolManagedRuntimeVersion switch
        {
            "" => "No Managed Code",
            "v2.0" => ".NET Framework 2.0/3.5",
            "v4.0" => ".NET Framework 4.x",
            null => "unknown",
            var other => other,
        };
    }

    private static List<HostedDatabaseDto> BuildDatabases(List<(string Machine, CensusEnvelope Envelope)> snapshots)
    {
        var occurrences = new List<(string Name, HostedDatabaseInstanceDto Instance)>();

        foreach (var (machine, envelope) in snapshots)
        {
            if (envelope.SqlServer?.Status != "ok") continue;
            foreach (var instance in envelope.SqlServer.Data?.Instances ?? [])
            {
                foreach (var db in instance.Databases ?? [])
                {
                    if (db.Name is null) continue;
                    // master on twelve machines is noise, and unlike the dossier there is no
                    // file-location argument for keeping them in a where-does-X-live pivot.
                    if (SystemDatabases.Contains(db.Name, StringComparer.OrdinalIgnoreCase)) continue;

                    var directories = (instance.DatabaseFiles ?? [])
                        .Where(f => string.Equals(f.DatabaseName, db.Name, StringComparison.OrdinalIgnoreCase))
                        .Select(f => f.Directory)
                        .Where(d => d is not null)
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .OrderBy(d => d, StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    occurrences.Add((db.Name, new HostedDatabaseInstanceDto
                    {
                        Machine = machine,
                        Instance = instance.InstanceName ?? "",
                        State = db.StateDesc,
                        RecoveryModel = db.RecoveryModelDesc,
                        Owner = db.Owner,
                        Directories = directories,
                    }));
                }
            }
        }

        return occurrences
            .GroupBy(o => o.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => new HostedDatabaseDto
            {
                Name = g.First().Name,
                InstanceCount = g.Count(),
                Instances = g.Select(o => o.Instance)
                    .OrderBy(i => i.Machine, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(i => i.Instance, StringComparer.OrdinalIgnoreCase).ToList(),
            })
            .OrderBy(d => d.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    // Grouped by TARGET, not source. Census collects downstream edges; blast radius needs the
    // inverse, and inverting them is the whole point of this view (graph-interop.md §6.1).
    private static List<DependencyTargetDto> BuildDependencies(List<(string Machine, CensusEnvelope Envelope)> snapshots)
    {
        var index = HostResolver.BuildIndex(snapshots);
        var occurrences = new List<(string Key, IisDependency Edge, DependencySourceDto Source)>();

        foreach (var (machine, envelope) in snapshots)
        {
            if (envelope.Iis?.Status != "ok") continue;
            foreach (var edge in envelope.Iis.Data?.Dependencies ?? [])
            {
                occurrences.Add((TargetLabel(edge), edge, new DependencySourceDto
                {
                    Machine = machine,
                    SiteName = edge.SiteName,
                    AppPath = edge.AppPath,
                    Name = edge.Name,
                    SourceFile = edge.SourceFile,
                    SecretsPresent = edge.SecretsPresent,
                    HadCredentials = edge.HadCredentials,
                    HadQuery = edge.HadQuery,
                }));
            }
        }

        return occurrences
            .GroupBy(o => o.Key, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var edge = g.First().Edge;
                var (verdict, detail) = edge.Kind == "http"
                    ? HostResolver.CorroborateHttp(edge, g.First().Source.Machine, index)
                    : HostResolver.Corroborate(edge, index);
                return new DependencyTargetDto
                {
                    Target = g.Key,
                    Kind = edge.Kind ?? "unknown",
                    Host = edge.Host,
                    Instance = edge.Instance,
                    Database = edge.Database,
                    IsLocal = edge.IsLocal,
                    Corroboration = verdict,
                    CorroborationDetail = detail,
                    SourceCount = g.Count(),
                    Sources = g.Select(o => o.Source)
                        .OrderBy(s => s.Machine, StringComparer.OrdinalIgnoreCase).ToList(),
                };
            })
            // Remote before local: an app talking to its own box is a dependency, but not the
            // one that matters for blast radius.
            .OrderBy(d => d.IsLocal)
            .ThenByDescending(d => d.SourceCount)
            .ThenBy(d => d.Target, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string TargetLabel(IisDependency edge) => edge.Kind switch
    {
        "http" => $"{edge.Scheme}://{edge.Host}{(edge.Port is null or 80 or 443 ? "" : ":" + edge.Port)}{edge.Path}",
        "file" => edge.FilePath ?? "(file)",
        _ => $"{edge.Host}{(edge.Instance is null ? "" : "\\" + edge.Instance)}{(edge.Database is null ? "" : " / " + edge.Database)}",
    };
}
