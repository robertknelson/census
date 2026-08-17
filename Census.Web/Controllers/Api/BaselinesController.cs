using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;
using Census.Web.Models.Baselines;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

public record BlessRequestDto
{
    public required string Id { get; init; }
    public required string Label { get; init; }
    public required string SourceMachine { get; init; }
    public Dictionary<string, List<string>> AppliesTo { get; init; } = [];
    public string Note { get; init; }
}

public record ApproveRequestDto
{
    public required string Machine { get; init; }
    public required BaselineEntry Entry { get; init; }
    public string Note { get; init; }
}

[ApiController]
[Route("api/baselines")]
public class BaselinesController(BaselinesStore baselinesStore, BaselineEvaluator baselineEvaluator, CensusStore censusStore, AssetsStore assetsStore) : ControllerBase
{
    private static readonly string[] ValidInstallScopes = [BaselineEvaluator.ScopeMachine, BaselineEvaluator.ScopePerUser];

    [HttpGet]
    public ActionResult<BaselinesViewDto> Get()
    {
        var fleet = baselineEvaluator.EvaluateFleet();

        var summaries = fleet.Config.Baselines.Select(b => new BaselineSummaryDto
        {
            Id = b.Id,
            Label = b.Label,
            AppliesTo = b.AppliesTo,
            Active = b.Active,
            Note = b.Note,
            SourceMachine = b.Provenance?.SourceMachine,
            SourceDate = b.Provenance?.SourceDate,
            BlessedUtc = b.Provenance?.BlessedUtc,
            EntryCount = b.Entries.Count,
            MatchedMachineCount = fleet.MatchCountsById.GetValueOrDefault(b.Id),
            JudgeableMachineCount = fleet.JudgeableCountsById.GetValueOrDefault(b.Id),
            Entries = b.Entries.Select(e => new BaselineEntryDto
            {
                DisplayName = e.DisplayName,
                Publisher = e.Publisher,
                Architecture = e.Architecture,
                InstallScope = e.InstallScope,
                ObservedVersion = e.ObservedVersion,
                Required = e.Required,
                PresentOn = fleet.PresentCountsByEntry.GetValueOrDefault(
                    (b.Id, BaselineEvaluator.EntryKey(e.DisplayName, e.Architecture, e.InstallScope))),
            }).ToList(),
        }).ToList();

        return Ok(new BaselinesViewDto { Baselines = summaries, Coverage = fleet.Coverage });
    }

    /// <summary>The file as it is on disk, for an editor that changes one field and writes it back.</summary>
    [HttpGet("config")]
    public ActionResult<BaselinesConfig> GetConfig() => Ok(baselinesStore.Load());

    [HttpGet("machines/{machine}")]
    public ActionResult<MachineBaselineDto> GetMachine(string machine)
    {
        var envelope = censusStore.GetLatestSnapshot(machine);
        var assets = assetsStore.Load();
        var facets = assetsStore.FacetsFor(assets, machine);
        var (resolvedClass, _) = MachineClassifier.Resolve(assets.Assets.GetValueOrDefault(machine)?.Class, envelope?.Roles ?? []);
        return Ok(baselineEvaluator.Evaluate(baselinesStore.Load(), machine, resolvedClass, facets, envelope));
    }

    [HttpPut]
    public IActionResult Put([FromBody] BaselinesConfig config)
    {
        var errors = Validate(config);
        if (errors.Count > 0) return BadRequest(new { errors });

        baselinesStore.Save(config);
        return NoContent();
    }

    /// <summary>
    /// The bless gesture: materialize a machine's current software set as an approved set
    /// (approved-baseline.md §3). Exclusions live here rather than in the browser so the file
    /// can never acquire entries the evaluator would not compare.
    /// </summary>
    [HttpPost("bless")]
    public IActionResult Bless([FromBody] BlessRequestDto request)
    {
        var snapshot = censusStore.GetSnapshotRefs(request.SourceMachine).LastOrDefault();
        var envelope = snapshot is null ? null : censusStore.GetLatestSnapshot(request.SourceMachine);
        if (envelope is null) return BadRequest(new { errors = new[] { $"'{request.SourceMachine}' has no collected snapshot to bless" } });
        if (envelope.Apps?.Status != "ok")
            return BadRequest(new { errors = new[] { $"'{request.SourceMachine}' software collection is {envelope.Apps?.Status ?? "missing"} — a partial set must never be blessed as complete" } });

        var config = baselinesStore.Load();
        config.Baselines.Add(new Baseline
        {
            Id = request.Id?.Trim() ?? "",
            Label = request.Label?.Trim() ?? "",
            AppliesTo = NormalizeSelector(request.AppliesTo),
            Active = true,
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
            Provenance = new BaselineProvenance
            {
                SourceMachine = request.SourceMachine,
                SourceDate = snapshot.Date.ToString("yyyy-MM-dd"),
                BlessedUtc = DateTimeOffset.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
            },
            Entries = BaselineEvaluator.EntriesFrom(envelope),
        });

        var errors = Validate(config);
        if (errors.Count > 0) return BadRequest(new { errors });

        baselinesStore.Save(config);
        return NoContent();
    }

    /// <summary>
    /// Approve one item on one machine — the exemption path (§5). It is not a second concept:
    /// the entry lands in a baseline scoped to that machine alone, which the union rule then
    /// treats like any other.
    /// </summary>
    [HttpPost("approve")]
    public IActionResult Approve([FromBody] ApproveRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Machine)) return BadRequest(new { errors = new[] { "machine is required" } });
        if (string.IsNullOrWhiteSpace(request.Note))
            return BadRequest(new { errors = new[] { "a note is required — an exemption nobody explained is an exemption nobody can review" } });

        var config = baselinesStore.Load();
        var id = $"{request.Machine.ToLowerInvariant()}-exemptions";
        var baseline = config.Baselines.FirstOrDefault(b => string.Equals(b.Id, id, StringComparison.OrdinalIgnoreCase));

        if (baseline is null)
        {
            baseline = new Baseline
            {
                Id = id,
                Label = $"{request.Machine} — exemptions",
                AppliesTo = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase)
                {
                    [BaselineEvaluator.MachineKey] = [request.Machine],
                },
                Note = request.Note.Trim(),
                Provenance = new BaselineProvenance { BlessedUtc = DateTimeOffset.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ") },
            };
            config.Baselines.Add(baseline);
        }
        else
        {
            // Each approval carries its own reason; appending keeps every one of them rather
            // than letting the second exemption inherit the first one's justification.
            baseline = baseline with { Note = $"{baseline.Note} · {request.Note.Trim()}".Trim(' ', '·') };
            config.Baselines[config.Baselines.FindIndex(b => string.Equals(b.Id, id, StringComparison.OrdinalIgnoreCase))] = baseline;
        }

        var key = BaselineEvaluator.EntryKey(request.Entry.DisplayName, request.Entry.Architecture, request.Entry.InstallScope);
        if (!baseline.Entries.Any(e => BaselineEvaluator.EntryKey(e.DisplayName, e.Architecture, e.InstallScope) == key))
        {
            baseline.Entries.Add(request.Entry);
        }

        var errors = Validate(config);
        if (errors.Count > 0) return BadRequest(new { errors });

        baselinesStore.Save(config);
        return NoContent();
    }

    private static Dictionary<string, List<string>> NormalizeSelector(Dictionary<string, List<string>> selector)
    {
        var normalized = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var (rawKey, rawValues) in selector)
        {
            var key = rawKey?.Trim() ?? "";
            if (key.Length == 0) continue;
            var values = (rawValues ?? [])
                .Select(v => v?.Trim() ?? "")
                .Where(v => v.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (values.Count > 0) normalized[key] = values;
        }
        return normalized;
    }

    private static List<string> Validate(BaselinesConfig config)
    {
        var errors = new List<string>();
        if (config.Version != 1) errors.Add("version must be 1");

        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var baseline in config.Baselines)
        {
            var where = $"baseline '{baseline.Id}'";

            if (string.IsNullOrWhiteSpace(baseline.Id)) errors.Add("every baseline needs a non-empty id");
            else if (!seenIds.Add(baseline.Id)) errors.Add($"duplicate baseline id '{baseline.Id}'");

            if (string.IsNullOrWhiteSpace(baseline.Label)) errors.Add($"{where}: label is required");

            foreach (var (key, values) in baseline.AppliesTo)
            {
                if (string.IsNullOrWhiteSpace(key)) { errors.Add($"{where}: selector keys must be non-empty"); continue; }
                if (values is null || values.Count == 0 || values.All(string.IsNullOrWhiteSpace))
                    errors.Add($"{where}: selector key '{key}' needs at least one value — an empty list would match nothing, silently");

                // A typo'd class would match no machine and report as a clean scope, which is
                // the one failure this feature exists to prevent.
                if (string.Equals(key, BaselineEvaluator.ClassKey, StringComparison.OrdinalIgnoreCase))
                {
                    foreach (var value in values ?? [])
                    {
                        if (!MachineClassifier.Precedence.Contains(value, StringComparer.OrdinalIgnoreCase)
                            && !string.Equals(value, MachineClassifier.Unclassified, StringComparison.OrdinalIgnoreCase))
                            errors.Add($"{where}: class '{value}' is not one of {string.Join(", ", MachineClassifier.Precedence)}, {MachineClassifier.Unclassified}");
                    }
                }
            }

            foreach (var entry in baseline.Entries)
            {
                if (string.IsNullOrWhiteSpace(entry.DisplayName)) errors.Add($"{where}: every entry needs a displayName");
                if (!ValidInstallScopes.Contains(entry.InstallScope))
                    errors.Add($"{where}: entry '{entry.DisplayName}' installScope must be one of {string.Join(", ", ValidInstallScopes)}");
            }
        }

        return errors;
    }
}
