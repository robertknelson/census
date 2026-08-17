using System.Collections.Generic;

namespace Census.Web.Models.Api;

public record MachineSummaryDto
{
    public required string Machine { get; init; }
    public string LatestDate { get; init; }
    public string ComputerName { get; init; }
    public List<string> Roles { get; init; } = [];
    public string ProductName { get; init; }
    public string InstallationType { get; init; }
    public string CurrentBuild { get; init; }
    public int? Ubr { get; init; }
    public bool? PendingReboot { get; init; }
    public bool? IsVirtual { get; init; }
    public int BlacklistHitCount { get; init; }
    public string HighestBlacklistSeverity { get; init; }
    public int? SoonestCertExpiryDays { get; init; }
}
