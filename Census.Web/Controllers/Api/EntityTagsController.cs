using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;
using Census.Web.Models.EntityTags;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/entity-tags")]
public class EntityTagsController(EntityTagsStore entityTagsStore, DeclaredEntitiesStore declaredEntitiesStore, SystemsStore systemsStore, EntityTagsEvaluator evaluator, CensusStore censusStore) : ControllerBase
{
    [HttpGet]
    public ActionResult<EntityTagsConfig> Get() => Ok(entityTagsStore.Load());

    // Whole-file replace, like the blacklist: the file is the source of truth and stays
    // hand-editable (entity-tags.md §7). Same unauthenticated-write caveat as every editor.
    [HttpPut]
    public IActionResult Put([FromBody] EntityTagsConfig config)
    {
        if (config is null) return BadRequest(new { errors = new[] { "a config body is required" } });
        entityTagsStore.Save(new EntityTagsConfig
        {
            Version = config.Version,
            Databases = Prune(config.Databases),
            Applications = Prune(config.Applications),
        });
        return NoContent();
    }

    [HttpGet("machine/{machine}")]
    public ActionResult<MachineEntityTagsDto> GetMachine(string machine) =>
        Ok(evaluator.Evaluate(machine, censusStore.GetLatestSnapshot(machine), entityTagsStore.Load(), declaredEntitiesStore.Load()));

    // The whole working set in one read (triage-workbench.md §3): per collected machine, the
    // pile, the strata, and the unknown scopes. Machines with nothing to show are dropped;
    // machines with no snapshot at all stay the findings stream's business.
    [HttpGet("triage")]
    public ActionResult<TriageDto> GetTriage()
    {
        var config = entityTagsStore.Load();
        var declaredConfig = declaredEntitiesStore.Load();
        var machines = new List<MachineEntityTagsDto>();
        var snapshots = new List<(string Machine, Models.Census.CensusEnvelope Envelope)>();
        foreach (var machine in censusStore.GetMachineDirs())
        {
            var envelope = censusStore.GetLatestSnapshot(machine);
            if (envelope is null) continue;
            snapshots.Add((machine, envelope));
            var dto = evaluator.Evaluate(machine, envelope, config, declaredConfig);
            if (dto.Rows.Count > 0 || dto.Unclassified.Count > 0 || dto.Unknown.Count > 0 || dto.Declared.Count > 0) machines.Add(dto);
        }

        var attribution = ExternalAttribution.Compute(snapshots, declaredConfig, HostResolver.BuildIndex(snapshots));
        var external = attribution.Entities.Select(e =>
        {
            var serves = Associations.Of(e.Entity.Serves, e.Entity.System, e.Entity.Stage, e.Entity.AssertedBy, e.Entity.AssertedAt);
            return new ExternalEntityDto
            {
                Name = e.Name,
                Kind = e.Entity.Kind,
                Serves = EntityTagsEvaluator.ToDtos(serves),
                System = Associations.SystemsOf(serves),
                Stage = Associations.StagesOf(serves),
                Note = e.Entity.Note,
                AssertedBy = e.Entity.AssertedBy,
                AssertedAt = e.Entity.AssertedAt,
                Endpoints = e.Identifiers.Select(i => new EndpointMatchDto
                {
                    Identifier = i.Identifier,
                    MatchedEdges = i.Edges.Count,
                    ShadowsMachine = i.ShadowsMachine,
                }).ToList(),
                MatchedEdgeCount = e.AllEdges.Count,
            };
        }).ToList();
        var unresolved = attribution.Unresolved.Select(u => new UnresolvedEndpointDto
        {
            Kind = u.Kind,
            Target = u.Target,
            Edges = u.Edges.Select(e => new UnresolvedEdgeDto
            {
                Machine = e.Machine,
                SiteName = e.SiteName,
                AppPath = e.AppPath,
                Name = e.Name,
                SourceFile = e.SourceFile,
            }).ToList(),
        }).ToList();

        // Suggestion vocabulary comes from the associations (entity-associations.md §4) —
        // legacy leaves contribute through the same read-both conversion as everywhere.
        var allServes = config.Databases.Values.Concat(config.Applications.Values)
            .SelectMany(containers => containers.Values)
            .SelectMany(l => l.Values)
            .Select(l => Associations.Of(l.Serves, l.System, l.Stage, l.AssertedBy, l.AssertedAt))
            .Concat(declaredConfig.OnMachines.Values.SelectMany(e => e.Values)
                .Select(e => Associations.Of(e.Serves, e.System, e.Stage, e.AssertedBy, e.AssertedAt)))
            .Concat(declaredConfig.External.Values
                .Select(e => Associations.Of(e.Serves, e.System, e.Stage, e.AssertedBy, e.AssertedAt)))
            .SelectMany(s => s)
            .ToList();

        // Stock kinds seed the declare form's chips before any are in use; free-form typing
        // stays open beside them (declared-entities.md §10.2).
        var kinds = new[] { "scheduled-task", "api", "service" }
            .Concat(declaredConfig.OnMachines.Values.SelectMany(e => e.Values).Select(e => e.Kind))
            .Concat(declaredConfig.External.Values.Select(e => e.Kind))
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(k => k, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Ok(new TriageDto
        {
            Machines = machines.OrderBy(m => m.Machine, StringComparer.OrdinalIgnoreCase).ToList(),
            Systems = Associations.SystemsOf(allServes),
            Stages = Associations.StagesOf(allServes),
            RegisteredSystems = systemsStore.Load().Systems
                .OrderBy(s => s.Key, StringComparer.OrdinalIgnoreCase)
                .Select(s => new RegisteredSystemDto { Name = s.Key, Description = s.Value.Description })
                .ToList(),
            // Untagged external entities and unresolved endpoints are pile too
            // (declared-entities.md §6) — the chip must not understate the queue.
            UnclassifiedTotal = machines.Sum(m => m.UnclassifiedCount)
                + external.Count(e => e.Serves.Count == 0)
                + unresolved.Count,
            External = external,
            UnresolvedEndpoints = unresolved,
            Kinds = kinds,
            MachineNames = censusStore.GetMachineDirs()
                .Concat(censusStore.GetMachinesConfig().Names)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(m => m, StringComparer.OrdinalIgnoreCase)
                .ToList(),
        });
    }

    // Values trimmed and deduped, and a leaf asserting nothing removed outright — an entry
    // with no meaning is meaningless, the same call AssetsController already makes.
    private static Dictionary<string, Dictionary<string, Dictionary<string, EntityTagAssertion>>> Prune(
        Dictionary<string, Dictionary<string, Dictionary<string, EntityTagAssertion>>> tree)
    {
        var machines = new Dictionary<string, Dictionary<string, Dictionary<string, EntityTagAssertion>>>(StringComparer.OrdinalIgnoreCase);
        foreach (var (machine, containers) in tree ?? new Dictionary<string, Dictionary<string, Dictionary<string, EntityTagAssertion>>>())
        {
            var byContainer = new Dictionary<string, Dictionary<string, EntityTagAssertion>>(StringComparer.OrdinalIgnoreCase);
            foreach (var (container, leaves) in containers ?? new Dictionary<string, Dictionary<string, EntityTagAssertion>>())
            {
                var kept = new Dictionary<string, EntityTagAssertion>(StringComparer.OrdinalIgnoreCase);
                foreach (var (name, assertion) in leaves ?? new Dictionary<string, EntityTagAssertion>())
                {
                    if (assertion is null) continue;
                    var serves = CleanServes(assertion.Serves);
                    var system = Clean(assertion.System);
                    var stage = Clean(assertion.Stage);
                    if ((serves?.Count ?? 0) == 0 && system.Count == 0 && stage.Count == 0 && (assertion.ExtraAxes is null || assertion.ExtraAxes.Count == 0)) continue;
                    kept[name] = assertion with
                    {
                        Serves = serves,
                        System = system.Count > 0 ? system : null,
                        Stage = stage.Count > 0 ? stage : null,
                    };
                }
                if (kept.Count > 0) byContainer[container] = kept;
            }
            if (byContainer.Count > 0) machines[machine] = byContainer;
        }
        return machines;
    }

    private static List<string> Clean(List<string> values) =>
        (values ?? [])
            .Select(v => v?.Trim() ?? "")
            .Where(v => v.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    /// <summary>An association with no system and no stages asserts nothing and is dropped; a stage-only one survives (the legacy shape's equivalent).</summary>
    private static List<Census.Web.Models.SystemAssociation> CleanServes(List<Census.Web.Models.SystemAssociation> serves)
    {
        if (serves is null) return null;
        var kept = serves
            .Where(a => a is not null)
            .Select(a => a with { System = a.System?.Trim() ?? "", Stages = Clean(a.Stages) })
            .Where(a => a.System.Length > 0 || a.Stages.Count > 0)
            .ToList();
        return kept.Count > 0 ? kept : null;
    }
}
