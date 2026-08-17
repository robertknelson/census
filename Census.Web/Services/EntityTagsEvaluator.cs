using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;
using Census.Web.Models.Census;
using Census.Web.Models.EntityTags;

namespace Census.Web.Services;

/// <summary>
/// Resolves one machine's entity-tag assertions against a snapshot (entity-tags.md §4).
/// Assertions are never inferred and never re-attached; each one resolves to observed,
/// dangling, or unknown, and only observed ones feed the rollup.
/// </summary>
public class EntityTagsEvaluator
{
    public const string ResolutionObserved = "observed";
    public const string ResolutionDangling = "dangling";
    public const string ResolutionUnknown = "unknown";

    public const string StatusNotCollected = "not-collected";

    public MachineEntityTagsDto Evaluate(string machine, CensusEnvelope envelope, EntityTagsConfig config)
    {
        var sqlStatus = envelope?.SqlServer?.Status ?? StatusNotCollected;
        var iisStatus = envelope?.Iis?.Status ?? StatusNotCollected;
        var rows = new List<EntityTagRowDto>();

        List<SqlInstance> instances = sqlStatus == "ok" ? envelope.SqlServer.Data?.Instances ?? [] : [];
        foreach (var (instanceName, leaves) in TreeFor(config.Databases, machine))
        {
            var instance = instances.FirstOrDefault(i => string.Equals(i.InstanceName, instanceName, StringComparison.OrdinalIgnoreCase));
            foreach (var (name, assertion) in leaves)
            {
                // Absence is only evidence when every level above the entity reported ok:
                // an unreachable instance (or a failed category) hides its databases, and a
                // hidden database must read as unknown, never as dangling.
                var resolution =
                    sqlStatus != "ok" ? ResolutionUnknown
                    : instance is null ? ResolutionDangling
                    : instance.ConnectedStatus != "ok" ? ResolutionUnknown
                    : instance.Databases.Any(d => string.Equals(d.Name, name, StringComparison.OrdinalIgnoreCase)) ? ResolutionObserved
                    : ResolutionDangling;
                rows.Add(Row("database", instanceName, name, assertion, resolution));
            }
        }

        List<IisApplication> applications = iisStatus == "ok" ? envelope.Iis.Data?.Applications ?? [] : [];
        foreach (var (siteName, leaves) in TreeFor(config.Applications, machine))
        {
            foreach (var (path, assertion) in leaves)
            {
                var resolution =
                    iisStatus != "ok" ? ResolutionUnknown
                    : applications.Any(a => string.Equals(a.SiteName, siteName, StringComparison.OrdinalIgnoreCase)
                                         && string.Equals(a.Path, path, StringComparison.OrdinalIgnoreCase)) ? ResolutionObserved
                    : ResolutionDangling;
                rows.Add(Row("application", siteName, path, assertion, resolution));
            }
        }

        var contributors = rows.Where(r => r.Resolution == ResolutionObserved).ToList();
        var unclassified = CollectUnclassified(machine, instances, applications, config);
        return new MachineEntityTagsDto
        {
            Machine = machine,
            SqlStatus = sqlStatus,
            IisStatus = iisStatus,
            Rows = rows,
            Rollup = new EntityRollupDto
            {
                Systems = contributors.SelectMany(r => r.System).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(s => s, StringComparer.OrdinalIgnoreCase).ToList(),
                Stages = contributors.SelectMany(r => r.Stage).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(s => s, StringComparer.OrdinalIgnoreCase).ToList(),
                DerivedFrom = contributors,
            },
            Unclassified = unclassified,
            UnclassifiedCount = unclassified.Count,
            Unknown = CollectUnknown(sqlStatus, iisStatus, instances, rows),
        };
    }

    private static List<UnclassifiedEntityDto> CollectUnclassified(string machine, List<SqlInstance> instances, List<IisApplication> applications, EntityTagsConfig config)
    {
        var databaseTags = TreeFor(config.Databases, machine);
        var applicationTags = TreeFor(config.Applications, machine);

        // System databases stay out of the pile: they are structure of the instance, not
        // deployed meaning, and counting them would make the pile look permanently dirty.
        // DatabaseId <= 4 is SQL Server's own designation, not a naming convention.
        var databases = instances
            .Where(i => i.ConnectedStatus == "ok")
            .SelectMany(i => i.Databases
                .Where(d => d.DatabaseId is null or > 4)
                .Where(d => !HasLeaf(databaseTags, i.InstanceName, d.Name))
                .Select(d => new UnclassifiedEntityDto { Kind = "database", Container = i.InstanceName, Name = d.Name }));

        var apps = applications
            .Where(a => !HasLeaf(applicationTags, a.SiteName, a.Path))
            .Select(a => new UnclassifiedEntityDto { Kind = "application", Container = a.SiteName, Name = a.Path });

        return databases.Concat(apps).ToList();
    }

    // "not-present" is a legitimate absence, not a failure — it only earns an unknown row
    // when assertions actually point into it. Unreachable instances always surface: a
    // filtered pile must never render as a smaller pile.
    private static List<UnknownScopeDto> CollectUnknown(string sqlStatus, string iisStatus, List<SqlInstance> instances, List<EntityTagRowDto> rows)
    {
        var unknown = new List<UnknownScopeDto>();
        var unknownDatabases = rows.Count(r => r.Kind == "database" && r.Resolution == ResolutionUnknown);
        var unknownApplications = rows.Count(r => r.Kind == "application" && r.Resolution == ResolutionUnknown);

        if (sqlStatus != "ok" && (sqlStatus != "not-present" || unknownDatabases > 0))
            unknown.Add(new UnknownScopeDto { Kind = "sql", Status = sqlStatus, UnverifiableCount = unknownDatabases });
        if (iisStatus != "ok" && (iisStatus != "not-present" || unknownApplications > 0))
            unknown.Add(new UnknownScopeDto { Kind = "iis", Status = iisStatus, UnverifiableCount = unknownApplications });

        foreach (var instance in instances.Where(i => i.ConnectedStatus != "ok"))
        {
            unknown.Add(new UnknownScopeDto
            {
                Kind = "instance",
                Container = instance.InstanceName,
                Status = instance.ConnectedStatus ?? "unknown",
                UnverifiableCount = rows.Count(r => r.Kind == "database" && r.Resolution == ResolutionUnknown
                    && string.Equals(r.Container, instance.InstanceName, StringComparison.OrdinalIgnoreCase)),
            });
        }
        return unknown;
    }

    /// <summary>The assertion at one address, or null — never inferred, never fuzzy.</summary>
    public static EntityTagAssertion AssertionFor(
        Dictionary<string, Dictionary<string, Dictionary<string, EntityTagAssertion>>> tree,
        string machine, string container, string name) =>
        container is not null && name is not null
        && tree.TryGetValue(machine, out var containers)
        && containers.TryGetValue(container, out var leaves)
        && leaves.TryGetValue(name, out var assertion) ? assertion : null;

    private static Dictionary<string, Dictionary<string, EntityTagAssertion>> TreeFor(
        Dictionary<string, Dictionary<string, Dictionary<string, EntityTagAssertion>>> tree, string machine) =>
        tree.TryGetValue(machine, out var containers) ? containers : [];

    private static bool HasLeaf(Dictionary<string, Dictionary<string, EntityTagAssertion>> containers, string container, string name) =>
        container is not null && name is not null
        && containers.TryGetValue(container, out var leaves) && leaves.ContainsKey(name);

    private static EntityTagRowDto Row(string kind, string container, string name, EntityTagAssertion assertion, string resolution) => new()
    {
        Kind = kind,
        Container = container,
        Name = name,
        System = assertion.System ?? [],
        Stage = assertion.Stage ?? [],
        AssertedBy = assertion.AssertedBy,
        AssertedAt = assertion.AssertedAt,
        Resolution = resolution,
    };
}
