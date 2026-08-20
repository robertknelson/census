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
public class EntityTagsController(EntityTagsStore entityTagsStore, DeclaredEntitiesStore declaredEntitiesStore, EntityTagsEvaluator evaluator, CensusStore censusStore) : ControllerBase
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
        foreach (var machine in censusStore.GetMachineDirs())
        {
            var envelope = censusStore.GetLatestSnapshot(machine);
            if (envelope is null) continue;
            var dto = evaluator.Evaluate(machine, envelope, config, declaredConfig);
            if (dto.Rows.Count > 0 || dto.Unclassified.Count > 0 || dto.Unknown.Count > 0 || dto.Declared.Count > 0) machines.Add(dto);
        }

        var leaves = config.Databases.Values.Concat(config.Applications.Values)
            .SelectMany(containers => containers.Values)
            .SelectMany(l => l.Values)
            .Select(l => (l.System, l.Stage))
            .Concat(declaredConfig.OnMachines.Values.SelectMany(e => e.Values).Select(e => (e.System, e.Stage)))
            .Concat(declaredConfig.External.Values.Select(e => (e.System, e.Stage)))
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
            Systems = leaves.SelectMany(l => l.System ?? new List<string>()).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(s => s, StringComparer.OrdinalIgnoreCase).ToList(),
            Stages = leaves.SelectMany(l => l.Stage ?? new List<string>()).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(s => s, StringComparer.OrdinalIgnoreCase).ToList(),
            UnclassifiedTotal = machines.Sum(m => m.UnclassifiedCount),
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
                    var system = Clean(assertion.System);
                    var stage = Clean(assertion.Stage);
                    if (system.Count == 0 && stage.Count == 0 && (assertion.ExtraAxes is null || assertion.ExtraAxes.Count == 0)) continue;
                    kept[name] = assertion with { System = system, Stage = stage };
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
}
