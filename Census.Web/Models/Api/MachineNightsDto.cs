using System.Collections.Generic;

namespace Census.Web.Models.Api;

/// <summary>One night with changes: the collected day, the collected day before it, and how many
/// rows the diff between them holds per section — the History list (census-web.md §16).</summary>
public record MachineNightDto
{
    public required string Date { get; init; }
    public required string Previous { get; init; }
    public int Scalar { get; init; }
    public Dictionary<string, SectionCountsDto> Sections { get; init; } = [];
    public int Total { get; init; }
}

public record SectionCountsDto(int Added, int Removed, int Changed);

public record MachineNightsDto
{
    public required string Machine { get; init; }
    /// <summary>week | month | all, as asked.</summary>
    public required string Range { get; init; }
    /// <summary>Consecutive collected-day pairs in the range (the nights looked at).</summary>
    public int NightsLookedAt { get; init; }
    /// <summary>True when the range held more pairs than Census:ChangesNightsMax; the newest are listed.</summary>
    public bool Truncated { get; init; }
    public List<MachineNightDto> Nights { get; init; } = [];
}
