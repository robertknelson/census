using System.Collections.Generic;

namespace Census.Web.Models.Api;

public record BaselineDeviationDto
{
    public required string DisplayName { get; init; }
    public string? DisplayVersion { get; init; }
    public string? Publisher { get; init; }
    public string? Architecture { get; init; }
    public required string InstallScope { get; init; }
}

/// <summary>A required entry no matching baseline found installed.</summary>
public record BaselineMissingDto
{
    public required string DisplayName { get; init; }
    public string? Publisher { get; init; }
    public string? Architecture { get; init; }
    public required string InstallScope { get; init; }
}

/// <summary>
/// One machine judged against the baselines that match it. `Status` is the honest three-way:
/// judged, outside every scope, or in scope but with software that could not be collected —
/// which must never render as approved.
/// </summary>
public record MachineBaselineDto
{
    public required string Machine { get; init; }
    public required string Status { get; init; }
    public string? Reason { get; init; }
    public List<string> MatchedBaselines { get; init; } = [];
    public List<BaselineDeviationDto> Deviations { get; init; } = [];
    public List<BaselineMissingDto> Missing { get; init; } = [];
}

/// <summary>
/// Stated wherever deviation counts appear (approved-baseline.md §7.1). "No deviations"
/// reading as "everything is approved" when nothing has been blessed is lying by omission.
/// </summary>
public record BaselineCoverageDto
{
    public int Machines { get; init; }
    public int InScope { get; init; }
    public int NotJudgeable { get; init; }
}

public record BaselineSummaryDto
{
    public required string Id { get; init; }
    public required string Label { get; init; }
    public Dictionary<string, List<string>> AppliesTo { get; init; } = [];
    public bool Active { get; init; }
    public string? Note { get; init; }
    public string? SourceMachine { get; init; }
    public string? SourceDate { get; init; }
    public string? BlessedUtc { get; init; }
    public int EntryCount { get; init; }
    public int MatchedMachineCount { get; init; }

    /// <summary>Matched machines whose software could be judged — the denominator for `PresentOn`.</summary>
    public int JudgeableMachineCount { get; init; }

    public List<BaselineEntryDto> Entries { get; init; } = [];
}

public record BaselineEntryDto
{
    public required string DisplayName { get; init; }
    public string? Publisher { get; init; }
    public string? Architecture { get; init; }
    public required string InstallScope { get; init; }
    public string? ObservedVersion { get; init; }
    public bool Required { get; init; }

    /// <summary>
    /// Judgeable matched machines carrying it. A required entry sitting at 0 is a typo'd
    /// displayName indicting every machine in scope — visible here rather than as a finding.
    /// </summary>
    public int PresentOn { get; init; }
}

public record BaselinesViewDto
{
    public List<BaselineSummaryDto> Baselines { get; init; } = [];
    public BaselineCoverageDto Coverage { get; init; } = new();
}
