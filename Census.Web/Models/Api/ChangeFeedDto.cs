using System.Collections.Generic;

namespace Census.Web.Models.Api;

public record ChangeEntryDto
{
    public required string Section { get; init; }
    public required string Kind { get; init; }     // added | removed | changed
    public required string Text { get; init; }
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
