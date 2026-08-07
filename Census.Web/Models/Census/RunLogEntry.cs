namespace Census.Web.Models.Census;

public record RunLogEntry
{
    public required string Machine { get; init; }

    /// <summary>
    /// ok | unreachable | access-denied | credential-error | config-error | failed.
    /// 'unreachable' and 'access-denied' are deliberately distinct: a rotated service-account
    /// password would otherwise read as a network problem. See census-collector.md 5.2.1.
    /// </summary>
    public required string Outcome { get; init; }

    public string? Reason { get; init; }
    public string? Bucket { get; init; }
    /// <summary>present | missing | unknown — set only when it is not 'present'.</summary>
    public string? TrustedHosts { get; init; }
    public DateTimeOffset StartedUtc { get; init; }
    public DateTimeOffset FinishedUtc { get; init; }
    public int DurationMs { get; init; }
}
