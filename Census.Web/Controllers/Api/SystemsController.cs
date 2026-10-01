using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models;
using Census.Web.Models.Systems;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

public record SystemOverviewDto
{
    public required string Name { get; init; }
    public bool Registered { get; init; }
    public string Description { get; init; }
    public List<string> ExpectedStages { get; init; }
    public string Note { get; init; }
    public string AssertedBy { get; init; }
    public string AssertedAt { get; init; }

    /// <summary>Entities whose associations claim this system — derived, never stored.</summary>
    public int MemberCount { get; init; }
    public List<string> StagesInUse { get; init; } = [];

    /// <summary>Distinct canonical names claimed within this system, and how many member entities carry one (canonical-names.md; system-view.md §9) — the builder offers grouped-or-not only when this is non-zero.</summary>
    public int CanonicalNameCount { get; init; }
    public int NamedMemberCount { get; init; }

    /// <summary>Expected-stage drift (systems-registry.md §3): asserted-but-unserved, and served-but-unexpected.</summary>
    public List<string> MissingExpectedStages { get; init; } = [];
    public List<string> UnexpectedStages { get; init; } = [];
}

[ApiController]
[Route("api/systems")]
public class SystemsController(SystemsStore systemsStore, EntityTagsStore entityTagsStore, DeclaredEntitiesStore declaredEntitiesStore) : ControllerBase
{
    [HttpGet]
    public ActionResult<SystemsConfig> Get() => Ok(systemsStore.Load());

    // Whole-file replace, the config-editor pattern. A record with an empty name is
    // meaningless and dropped; everything else survives — an empty record is still a
    // deliberate registration.
    [HttpPut]
    public IActionResult Put([FromBody] SystemsConfig config)
    {
        if (config is null) return BadRequest(new { errors = new[] { "a config body is required" } });

        var systems = new Dictionary<string, SystemRecord>(StringComparer.OrdinalIgnoreCase);
        foreach (var (name, record) in config.Systems ?? new Dictionary<string, SystemRecord>())
        {
            if (record is null || string.IsNullOrWhiteSpace(name)) continue;
            var expected = (record.ExpectedStages ?? [])
                .Select(v => v?.Trim() ?? "")
                .Where(v => v.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            systems[name.Trim()] = record with
            {
                Description = string.IsNullOrWhiteSpace(record.Description) ? null : record.Description.Trim(),
                ExpectedStages = expected.Count > 0 ? expected : null,
                Note = string.IsNullOrWhiteSpace(record.Note) ? null : record.Note.Trim(),
            };
        }

        systemsStore.Save(new SystemsConfig { Version = config.Version, Systems = systems });
        return NoContent();
    }

    /// <summary>
    /// The registry joined against what associations actually claim: member counts, stages
    /// in use, expected-stage drift, and unregistered in-use names — all derived per read.
    /// </summary>
    [HttpGet("overview")]
    public ActionResult<List<SystemOverviewDto>> GetOverview()
    {
        var registry = systemsStore.Load();
        var inUse = CollectInUse();

        var rows = new List<SystemOverviewDto>();
        foreach (var (name, record) in registry.Systems)
        {
            var found = inUse.TryGetValue(name, out var usage);
            var stagesInUse = found ? usage.Stages : [];
            var expected = record.ExpectedStages ?? [];
            rows.Add(new SystemOverviewDto
            {
                Name = name,
                Registered = true,
                Description = record.Description,
                ExpectedStages = record.ExpectedStages,
                Note = record.Note,
                AssertedBy = record.AssertedBy,
                AssertedAt = record.AssertedAt,
                MemberCount = found ? usage.Members : 0,
                StagesInUse = stagesInUse,
                CanonicalNameCount = found ? usage.CanonicalNames.Count : 0,
                NamedMemberCount = found ? usage.Named : 0,
                MissingExpectedStages = expected.Where(e => !stagesInUse.Contains(e, StringComparer.OrdinalIgnoreCase)).ToList(),
                UnexpectedStages = record.ExpectedStages is null ? []
                    : stagesInUse.Where(s => !expected.Contains(s, StringComparer.OrdinalIgnoreCase)).ToList(),
            });
        }
        foreach (var (name, usage) in inUse.Where(u => !registry.Systems.ContainsKey(u.Key)))
        {
            rows.Add(new SystemOverviewDto
            {
                Name = name,
                Registered = false,
                MemberCount = usage.Members,
                StagesInUse = usage.Stages,
                CanonicalNameCount = usage.CanonicalNames.Count,
                NamedMemberCount = usage.Named,
            });
        }

        return Ok(rows
            .OrderByDescending(r => r.Registered)
            .ThenBy(r => r.Name, StringComparer.OrdinalIgnoreCase)
            .ToList());
    }

    private sealed class Usage
    {
        public int Members;
        public int Named;
        public List<string> Stages = [];
        public HashSet<string> CanonicalNames = new(StringComparer.OrdinalIgnoreCase);
    }

    private Dictionary<string, Usage> CollectInUse()
    {
        var tags = entityTagsStore.Load();
        var declared = declaredEntitiesStore.Load();

        var perEntity = tags.Databases.Values.Concat(tags.Applications.Values)
            .SelectMany(containers => containers.Values)
            .SelectMany(l => l.Values)
            .Select(l => Associations.Of(l.Serves, l.System, l.Stage, l.AssertedBy, l.AssertedAt))
            .Concat(declared.OnMachines.Values.SelectMany(e => e.Values)
                .Select(e => Associations.Of(e.Serves, e.System, e.Stage, e.AssertedBy, e.AssertedAt)))
            .Concat(declared.External.Values
                .Select(e => Associations.Of(e.Serves, e.System, e.Stage, e.AssertedBy, e.AssertedAt)));

        var result = new Dictionary<string, Usage>(StringComparer.OrdinalIgnoreCase);
        foreach (var serves in perEntity)
        {
            foreach (var assoc in serves.Where(a => !string.IsNullOrEmpty(a.System)))
            {
                if (!result.TryGetValue(assoc.System, out var entry)) result[assoc.System] = entry = new Usage();
                entry.Members += 1;
                if (!string.IsNullOrWhiteSpace(assoc.CanonicalName))
                {
                    entry.Named += 1;
                    entry.CanonicalNames.Add(assoc.CanonicalName.Trim());
                }
                foreach (var stage in assoc.Stages ?? [])
                {
                    if (!entry.Stages.Contains(stage, StringComparer.OrdinalIgnoreCase)) entry.Stages.Add(stage);
                }
            }
        }
        foreach (var entry in result.Values)
        {
            entry.Stages = entry.Stages.OrderBy(s => s, StringComparer.OrdinalIgnoreCase).ToList();
        }
        return result;
    }
}
