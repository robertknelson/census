namespace Census.Web.Models.Api;

public record MachineCoverageDto
{
    public required string Machine { get; init; }
    public bool EverCollected { get; init; }
    public string? LastSnapshotDate { get; init; }
    public string? LastRunOutcome { get; init; }
    public string? LastRunReason { get; init; }
    public string? LastRunDate { get; init; }
    public string? LastOkDate { get; init; }
    public int? LastOkAgeDays { get; init; }
    public bool OrphanOkNoFile { get; init; }
}
