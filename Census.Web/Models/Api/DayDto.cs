using System.Collections.Generic;

namespace Census.Web.Models.Api;

public record DayMachineDto
{
    public required string Machine { get; init; }

    /// <summary>
    /// On a day: changed | quiet | first-seen | not-collected. In a range: changed | quiet |
    /// collected-once | not-collected (day-view.md §3).
    /// </summary>
    public required string Status { get; init; }
    public string FromDate { get; init; }
    public string ToDate { get; init; }
    public List<ChangeEntryDto> Entries { get; init; } = [];
}

public record DayDto
{
    /// <summary>The day compared, or null when a range was asked for (or nothing was ever collected).</summary>
    public string Day { get; init; }
    public string From { get; init; }
    public string To { get; init; }
    public List<DayMachineDto> Machines { get; init; } = [];
    public DayFindingsDto Findings { get; init; }
}

/// <summary>
/// The findings stream as of the day against the day before — or as of To against as of From
/// (day-view.md §5a): born is in the later and not the earlier by Key, cleared the reverse.
/// </summary>
public record DayFindingsDto
{
    public required string Before { get; init; }
    public required string AsOf { get; init; }
    public List<FindingDto> Born { get; init; } = [];
    public List<FindingDto> Cleared { get; init; } = [];
}

public record DayCountDto
{
    public required string Day { get; init; }
    public int Collected { get; init; }
    public int Changed { get; init; }
}
