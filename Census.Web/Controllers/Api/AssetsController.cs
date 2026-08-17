using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Assets;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

public record AssetAssignmentDto
{
    public string Class { get; init; }
    public Dictionary<string, List<string>> Facets { get; init; } = [];
}

[ApiController]
[Route("api/assets")]
public class AssetsController(AssetsStore assetsStore) : ControllerBase
{
    [HttpPut("{machine}")]
    public IActionResult Put(string machine, [FromBody] AssetAssignmentDto dto)
    {
        if (string.IsNullOrWhiteSpace(machine)) return BadRequest(new { errors = new[] { "machine name is required" } });

        var errors = new List<string>();

        var overrideClass = string.IsNullOrWhiteSpace(dto.Class) ? null : dto.Class.Trim();
        if (overrideClass is not null && !MachineClassifier.Precedence.Contains(overrideClass, StringComparer.OrdinalIgnoreCase))
            errors.Add($"class must be one of {string.Join(", ", MachineClassifier.Precedence)} (or empty to derive from observed roles)");

        var facets = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var (rawKey, rawValues) in dto.Facets)
        {
            var key = rawKey?.Trim() ?? "";
            if (key.Length == 0) { errors.Add("facet keys must be non-empty"); continue; }

            var values = (rawValues ?? [])
                .Select(v => v?.Trim() ?? "")
                .Where(v => v.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (values.Count > 0) facets[key] = values;
        }

        if (errors.Count > 0) return BadRequest(new { errors });

        var config = assetsStore.Load();
        if (overrideClass is null && facets.Count == 0)
        {
            // An entry with nothing asserted is meaningless — removing it returns the
            // machine to unassigned, which the findings stream will say out loud.
            config.Assets.Remove(machine);
        }
        else
        {
            config.Assets[machine] = new AssetEntry { Class = overrideClass, Facets = facets };
        }
        assetsStore.Save(config);
        return NoContent();
    }
}
