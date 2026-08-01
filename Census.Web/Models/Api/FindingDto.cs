namespace Census.Web.Models.Api;

public record FindingDto
{
    public required string Kind { get; init; }
    public required string Severity { get; init; }
    public required string Machine { get; init; }
    public required string Title { get; init; }
    public string? Detail { get; init; }
    public Dictionary<string, List<string>> Facets { get; init; } = [];
    public List<string> Ownership { get; init; } = [];
}

public record FindingsResultDto
{
    public OwnershipInfoDto? Ownership { get; init; }
    public List<FindingDto> Findings { get; init; } = [];
}

public record OwnershipInfoDto
{
    public required string Key { get; init; }
    public required string Label { get; init; }
}
