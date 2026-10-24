using System;
using System.Data;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Gatehouse.CommandQuery;
using Gatehouse.Logs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Gatehouse.AppEvents.Data;

// AppEvent's reads and writes as command/query keys (gatehouse.md §12). The catalog of kinds lives in AppTrak (the
// "default" connection); the events in the log tables (the "logs" connection, AppEventCommandHandler and
// LogsQueryHandler). The controllers have checked every value; here each one is bound.
public class AppEventsSqlCommandInitializer : SqlCommandInitializer
{
    public const string Name = "app-events";

    public AppEventsSqlCommandInitializer(IOptions<LogsOptions> logs)
    {
        var schema = logs.Value.Schema;

        Initializers.Add($"{Domain}.{Name}.kinds", (c, p, n) => Script(c, "kinds.sql"));
        Initializers.Add($"{Domain}.{Name}.kind-audit", (c, p, n) => Script(c, "kind-audit.sql").Parameters.Add(Int("@Id", p.TryGet("id", out int id) ? id : 0)));
        Initializers.Add($"{Domain}.{Name}.kind-save", (c, p, n) => Script(c, "kind-save.sql").Parameters.AddRange(new[]
        {
            Text("@Actor", p.TryGet("username", out string user) ? user : null, 100),
            new SqlParameter("@Id", SqlDbType.Int) { Value = p.TryGet("id", out int id) ? id : DBNull.Value },
            Text("@Namespace", ((string)n["namespace"]).Trim(), 50),
            Text("@CommandName", ((string)n["commandName"]).Trim(), 50),
            Text("@DisplayName", ((string)n["displayName"]).Trim(), 100),
            Text("@Description", string.IsNullOrWhiteSpace((string)n["description"]) ? null : ((string)n["description"]).Trim(), 500),
            new SqlParameter("@ApplicationId", SqlDbType.Int) { Value = (object)(int?)n["applicationId"] ?? DBNull.Value },
            new SqlParameter("@Disposition", SqlDbType.VarChar, 20) { Value = (string)n["disposition"] ?? "current" },
        }));

        Initializers.Add($"{Domain}.{Name}.kinds-seen", (c, p, n) =>
        {
            Script(c, "kinds-seen.sql").Parameters.Add(Text("@Schema", schema, 128));
            c.Parameters.Add(Int("@Days", p.TryGet("days", out int days) ? days : 30));
        });
    }

    private static SqlCommand Script(SqlCommand command, string file)
    {
        command.CommandType = CommandType.Text;
        command.CommandText = SqlScript.Load($"app-events/sql/{file}");
        return command;
    }

    private static SqlParameter Int(string name, int value) => new(name, SqlDbType.Int) { Value = value };

    private static SqlParameter Text(string name, string value, int size) =>
        new(name, SqlDbType.NVarChar, size) { Value = (object)value ?? DBNull.Value };
}

// Writes to the log tables go through the "logs" connection, as the reads do.
public class AppEventCommandHandler(IInitializerLocator locator, ILogger<JsonCommandHandler> logger, IConfiguration configuration)
    : JsonCommandHandler(locator, logger, configuration)
{
    public override string ConnectionKey => "logs";
}

// The names a kind is made of (AE-R3): kebab-case, and the command NOUN-VERB, at least two words. Whether the first
// word is a noun is the registrant's to judge; the form is checked here, for the catalog and for every event sent.
public static class AppEventNames
{
    private static readonly Regex Kebab = new("^[a-z0-9]+(-[a-z0-9]+)*$", RegexOptions.Compiled);

    // The lifecycle (AE-R1): what CommandActivity may hold.
    public static readonly string[] Activities = { "created", "handed-off", "received", "started", "completed", "failed" };

    public static string CheckNamespace(string value) =>
        string.IsNullOrWhiteSpace(value) ? "Namespace is required."
        : value.Length > 50 ? "Namespace can be at most 50 characters."
        : Kebab.IsMatch(value) ? null : $"Namespace '{value}' must be kebab-case (lowercase words joined by '-'), e.g. underwriting.";

    public static string CheckCommandName(string value) =>
        string.IsNullOrWhiteSpace(value) ? "CommandName is required."
        : value.Length > 50 ? "CommandName can be at most 50 characters."
        : !Kebab.IsMatch(value) ? $"CommandName '{value}' must be kebab-case (lowercase words joined by '-')."
        : value.Contains('-') ? null : $"CommandName '{value}' must be NOUN-VERB, at least two words, e.g. quote-request.";

    public static string CheckActivity(string value) =>
        Array.IndexOf(Activities, value) >= 0 ? null : $"CommandActivity '{value}' must be one of {string.Join(", ", Activities)}.";
}
