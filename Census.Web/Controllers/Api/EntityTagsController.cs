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
public class EntityTagsController(EntityTagsStore entityTagsStore, EntityTagsEvaluator evaluator, CensusStore censusStore) : ControllerBase
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
        Ok(evaluator.Evaluate(machine, censusStore.GetLatestSnapshot(machine), entityTagsStore.Load()));

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
