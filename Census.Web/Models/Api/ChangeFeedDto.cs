using System.Collections.Generic;

namespace Census.Web.Models.Api;

public record ChangeEntryDto
{
    public required string Section { get; init; }
    public required string Kind { get; init; }     // added | removed | changed
    public required string Text { get; init; }

    /// <summary>
    /// The day's judgement of an installed-software row against the machine's approved
    /// baseline (day-view.md §5b): expected | unexpected | null when nothing can be said.
    /// The fleet feed never sets it.
    /// </summary>
    public string Expectation { get; init; }
}

public record MachineChangesDto
{
    public required string Machine { get; init; }
    public required string FromDate { get; init; }
    public required string ToDate { get; init; }
    public List<ChangeEntryDto> Entries { get; init; } = [];
}

public record ChangeFeedDto
{
    public List<MachineChangesDto> Machines { get; init; } = [];
}
