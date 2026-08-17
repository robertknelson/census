using System.Collections.Generic;

namespace Census.Web.Models.Api;

public record CanvasOwnerDto
{
    public required string Value { get; init; }
    public int MachineCount { get; init; }
    public int CriticalFindings { get; init; }
    public int TotalFindings { get; init; }
}

public record CanvasMachineDto
{
    public required string Machine { get; init; }
    public required string Class { get; init; }
    public required string ClassSource { get; init; }
    public List<string> ObservedRoles { get; init; } = [];
    public List<string> Stages { get; init; } = [];
    public List<string> Owners { get; init; } = [];
    public Dictionary<string, List<string>> Facets { get; init; } = [];
    public required string Posture { get; init; }
    public int FindingCount { get; init; }
    public List<FindingDto> Findings { get; init; } = [];
    public bool HasData { get; init; }
    public string OsProductName { get; init; }
    public string LatestDate { get; init; }

    /// <summary>Derived from entity tags — rendered distinctly from the asserted Stages, never merged into them.</summary>
    public EntityRollupDto EntityRollup { get; init; }
}

public record CanvasDto
{
    public OwnershipInfoDto Ownership { get; init; }
    public List<CanvasOwnerDto> Owners { get; init; } = [];
    public List<CanvasMachineDto> Machines { get; init; } = [];
}
