namespace Gatehouse.Logs;

// The shared log tables (gatehouse.md §3, Census's log-explorer-and-trace.md §8). The connection string "logs" names
// the database that holds them (in the live app, AppTrak: point it where "default" points). Schema is theirs: apptrak
// in the real AppTrak; xf-dashboard's DDL names it log.
public class LogsOptions
{
    public const string SectionName = "Logs";

    public string Schema { get; set; } = "apptrak";

    // A request this slow counts as slow in Usage, as in Log Explorer's Slow pick.
    public int SlowMs { get; set; } = 2000;
}

// Usage's settings (Census's usage.md §4.4): the period's fiscal start and the thresholds of the friction signals. A
// signal points at sessions; it is never a verdict, so these are there to be tuned against real volume.
public class UsageOptions
{
    public const string SectionName = "Usage";

    // The month a fiscal year starts (1-12) for the period picker.
    public int FiscalYearStartMonth { get; set; } = 10;

    public FrictionOptions Friction { get; set; } = new();

    // Staff and test identifiers left out of every figure (gatehouse.md §13 U-R3): per application name, or "*" for
    // every application. The pages say who is left out.
    public System.Collections.Generic.Dictionary<string, string[]> Excluded { get; set; } = new(System.StringComparer.OrdinalIgnoreCase);
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
    // DeadEndMinRate, with at least DeadEndMinViews views.
    public double DeadEndFactor { get; set; } = 2;
    public double DeadEndMinRate { get; set; } = 0.75;
    public int DeadEndMinViews { get; set; } = 20;
}
