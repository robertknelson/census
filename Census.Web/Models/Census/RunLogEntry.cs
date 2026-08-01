namespace Census.Web.Models.Census;

public record RunLogEntry
{
    public required string Machine { get; init; }
    public required string Outcome { get; init; }
    public string? Reason { get; init; }
    public DateTimeOffset StartedUtc { get; init; }
    public DateTimeOffset FinishedUtc { get; init; }
    public int DurationMs { get; init; }
}
