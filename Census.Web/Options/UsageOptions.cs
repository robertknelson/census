namespace Census.Web.Options;

// Usage's settings (usage.md §4.4): the thresholds of the friction signals. A signal points at sessions; it is
// never a verdict, so these are there to be tuned against real volume.
public class UsageOptions
{
    public const string SectionName = "Usage";

    public FrictionOptions Friction { get; set; } = new();
}

public class FrictionOptions
{
    // Ended on an error: the session's last request came within this many minutes of a failure.
    public int EndedWithinMinutes { get; set; } = 2;

    // Refused repeatedly: one call refused this many times for one person in a session.
    public int RefusedTimes { get; set; } = 3;

    // Loop: one page loaded this many times within LoopSeconds in a session.
    public int LoopLoads { get; set; } = 5;
    public int LoopSeconds { get; set; } = 60;

    // Retry: the same write (method and path) sent again within this many seconds.
    public int RetrySeconds { get; set; } = 10;

    // Slow page: its requests' 90th percentile at or over Logs:SlowMs, with at least this many requests.
    public int SlowMinRequests { get; set; } = 20;

    // Dead end: a page whose exit rate is at least DeadEndFactor times the application's median and at least
    // DeadEndMinRate, with at least DeadEndMinViews views. (3x the median, the first rule, cannot fire once the
    // median passes 33%: calls-made-for-you, 2026-10-23.)
    public double DeadEndFactor { get; set; } = 2;
    public double DeadEndMinRate { get; set; } = 0.75;
    public int DeadEndMinViews { get; set; } = 20;
}
