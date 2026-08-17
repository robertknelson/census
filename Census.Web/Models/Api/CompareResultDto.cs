using System.Collections.Generic;

namespace Census.Web.Models.Api;

public record CompareRowDto
{
    public required string Label { get; init; }
    public List<string> Values { get; init; } = [];
    public bool Differs { get; init; }
    public bool Volatile { get; init; }
}

public record CompareGroupDto
{
    public required string Name { get; init; }
    public required string Title { get; init; }
    public bool Identical { get; init; }
    public int DifferCount { get; init; }
    public List<CompareRowDto> Rows { get; init; } = [];
}

public record CompareResultDto
{
    public List<string> Machines { get; init; } = [];
    public List<string> MachinesWithoutData { get; init; } = [];
    public List<CompareGroupDto> Groups { get; init; } = [];
}
