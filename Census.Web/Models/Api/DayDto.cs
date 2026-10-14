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
}

public record DayCountDto
{
    public required string Day { get; init; }
    public int Collected { get; init; }
    public int Changed { get; init; }
}
