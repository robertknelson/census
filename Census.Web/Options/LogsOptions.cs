namespace Census.Web.Options;

// The shared log tables (log-explorer-and-trace.md §8). ConnectionString names the database that
// holds the log tables; absent, MoveIt's (AppTrak's) is used. Schema is theirs: apptrak in the real
// AppTrak (Robert, 2026-10-23); xf-dashboard's DDL names it log.
public class LogsOptions
{
    public const string SectionName = "Logs";

    public string ConnectionString { get; set; }
    public string Schema { get; set; } = "apptrak";
}
