using System.Collections.Generic;

namespace Census.Web.Models.Api;

public record ComplianceTrendPoint
{
    public required string Date { get; init; }
    public int MachinesCollected { get; init; }
    public int MachinesWithHits { get; init; }
    public int TotalHits { get; init; }
}

public record ComplianceSummaryDto
{
    public int TotalMachines { get; init; }
    public int MachinesWithHits { get; init; }
    public Dictionary<string, int> HitCountBySeverity { get; init; } = [];
    public List<ComplianceTrendPoint> Trend { get; init; } = [];
}
