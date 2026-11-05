using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Census.Web.Models.Blacklist;
using Census.Web.Options;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/blacklist")]
public class BlacklistController : ControllerBase
{
    private static readonly string[] ValidTargets = ["apps", "dotnet.coreRuntimes", "dotnet.sdks"];
    private static readonly string[] ValidMatchTypes = ["exact", "contains", "regex"];
    private static readonly string[] ValidOps = ["<", "<=", "==", ">=", ">"];
    // Provisional set — severity tiers aren't ratified yet (census-web.md §8).
    private static readonly string[] ValidSeverities = ["critical", "high", "medium", "low"];
    private static readonly Dictionary<string, string[]> ValidFieldsByTarget = new()
    {
        ["apps"] = ["displayName", "publisher"],
        ["dotnet.coreRuntimes"] = ["name"],
        ["dotnet.sdks"] = ["name"],
    };

    private static readonly JsonSerializerOptions ReadOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    // Pretty-printed with relaxed escaping so the file stays pleasant to hand-edit — no
    // unicode escape sequences where the operator typed a literal character. The UX is an
    // editor of the operator-owned file, not its replacement.
    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly AssertionDocuments _documents;

    // The document is AppTrak's rows or the file, as AssertionDocuments decides (census-on-apptrak.md §6).
    public BlacklistController(AssertionDocuments documents)
    {
        _documents = documents;
    }

    [HttpGet]
    public ActionResult<BlacklistConfig> Get()
    {
        var json = _documents.Read("blacklist");
        if (json == null) return Ok(new BlacklistConfig { Version = 1 });
        return Ok(JsonSerializer.Deserialize<BlacklistConfig>(json, ReadOptions) ?? new BlacklistConfig { Version = 1 });
    }

    [HttpPut]
    public IActionResult Put([FromBody] BlacklistConfig config)
    {
        var errors = Validate(config);
        if (errors.Count > 0) return BadRequest(new { errors });

        _documents.Write("blacklist", JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine).EnsureSaved();
        return NoContent();
    }

    private static List<string> Validate(BlacklistConfig config)
    {
        var errors = new List<string>();
        if (config.Version != 1) errors.Add("version must be 1");

        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var rule in config.Rules)
        {
            var where = $"rule '{rule.Id}'";

            if (string.IsNullOrWhiteSpace(rule.Id)) errors.Add("every rule needs a non-empty id");
            else if (!seenIds.Add(rule.Id)) errors.Add($"duplicate rule id '{rule.Id}'");

            if (!ValidTargets.Contains(rule.Target))
                errors.Add($"{where}: target must be one of {string.Join(", ", ValidTargets)}");

            if (!ValidMatchTypes.Contains(rule.Match.MatchType))
                errors.Add($"{where}: matchType must be one of {string.Join(", ", ValidMatchTypes)}");

            if (ValidFieldsByTarget.TryGetValue(rule.Target, out var validFields) && !validFields.Contains(rule.Match.Field))
                errors.Add($"{where}: field for target '{rule.Target}' must be one of {string.Join(", ", validFields)}");

            if (string.IsNullOrWhiteSpace(rule.Match.Value))
                errors.Add($"{where}: match value is required");
            else if (rule.Match.MatchType == "regex")
            {
                try { _ = new Regex(rule.Match.Value); }
                catch (ArgumentException ex) { errors.Add($"{where}: invalid regex — {ex.Message}"); }
            }

            if (rule.Version is not null)
            {
                if (!ValidOps.Contains(rule.Version.Op))
                    errors.Add($"{where}: version op must be one of {string.Join(", ", ValidOps)}");
                if (VersionComparer.TryCompare(rule.Version.Value, rule.Version.Value) is null)
                    errors.Add($"{where}: version value '{rule.Version.Value}' is not dotted-numeric");
            }

            if (!ValidSeverities.Contains(rule.Severity, StringComparer.OrdinalIgnoreCase))
                errors.Add($"{where}: severity must be one of {string.Join(", ", ValidSeverities)}");

            if (string.IsNullOrWhiteSpace(rule.Reason))
                errors.Add($"{where}: reason is required");
        }

        return errors;
    }
}
