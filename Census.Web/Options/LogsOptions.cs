namespace Census.Web.Options;

// The shared log tables (log-explorer-and-trace.md §8). ConnectionString names the database that
// holds the log schema; absent, MoveIt's (AppTrak's) is used, as the Demo profile does.
public class LogsOptions
{
    public const string SectionName = "Logs";

    public string ConnectionString { get; set; }
}
