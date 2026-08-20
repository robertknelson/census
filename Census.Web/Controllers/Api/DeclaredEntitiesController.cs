using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.DeclaredEntities;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/declared-entities")]
public class DeclaredEntitiesController(DeclaredEntitiesStore declaredEntitiesStore) : ControllerBase
{
    [HttpGet]
    public ActionResult<DeclaredEntitiesConfig> Get() => Ok(declaredEntitiesStore.Load());

    // Whole-file replace, the config-editor pattern. Unlike entity tags, an axis-less record
    // survives the prune: untagged declaration is ratified (declared-entities.md §10.6) —
    // the record's existence is the assertion, not its tags.
    [HttpPut]
    public IActionResult Put([FromBody] DeclaredEntitiesConfig config)
    {
        if (config is null) return BadRequest(new { errors = new[] { "a config body is required" } });

        var onMachines = new Dictionary<string, Dictionary<string, DeclaredEntity>>(StringComparer.OrdinalIgnoreCase);
        foreach (var (machine, entities) in config.OnMachines ?? new Dictionary<string, Dictionary<string, DeclaredEntity>>())
        {
            var kept = new Dictionary<string, DeclaredEntity>(StringComparer.OrdinalIgnoreCase);
            foreach (var (name, entity) in entities ?? new Dictionary<string, DeclaredEntity>())
            {
                if (entity is null || string.IsNullOrWhiteSpace(name)) continue;
                kept[name.Trim()] = Clean(entity);
            }
            if (kept.Count > 0) onMachines[machine] = kept;
        }

        var external = new Dictionary<string, DeclaredEntity>(StringComparer.OrdinalIgnoreCase);
        foreach (var (name, entity) in config.External ?? new Dictionary<string, DeclaredEntity>())
        {
            if (entity is null || string.IsNullOrWhiteSpace(name)) continue;
            external[name.Trim()] = Clean(entity);
        }

        declaredEntitiesStore.Save(new DeclaredEntitiesConfig
        {
            Version = config.Version,
            OnMachines = onMachines,
            External = external,
        });
        return NoContent();
    }

    private static DeclaredEntity Clean(DeclaredEntity entity) => entity with
    {
        Kind = string.IsNullOrWhiteSpace(entity.Kind) ? null : entity.Kind.Trim(),
        Endpoints = entity.Endpoints is null ? null : CleanValues(entity.Endpoints),
        System = CleanValues(entity.System),
        Stage = CleanValues(entity.Stage),
        Note = string.IsNullOrWhiteSpace(entity.Note) ? null : entity.Note.Trim(),
    };

    private static List<string> CleanValues(List<string> values) =>
        (values ?? [])
            .Select(v => v?.Trim() ?? "")
            .Where(v => v.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
}
