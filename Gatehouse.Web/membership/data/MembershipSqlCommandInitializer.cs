using System;
using System.Data;
using System.Text.Json.Nodes;
using Gatehouse.CommandQuery;
using Microsoft.Data.SqlClient;

namespace Gatehouse.Membership.Data;

// Census's membership page as command/query keys (gatehouse.md §7): the same scripts, every value a parameter. The
// controller has already checked the body (MembershipRequests); here it is bound, trimmed as Census trims it.
public class MembershipSqlCommandInitializer : SqlCommandInitializer
{
    public const string Name = "membership";

    public MembershipSqlCommandInitializer()
    {
        Initializers.Add($"{Domain}.{Name}.applications", (c, p, n) => Script(c, "admin-applications.sql"));
        Initializers.Add($"{Domain}.{Name}.members", (c, p, n) => Script(c, "members.sql"));
        Initializers.Add($"{Domain}.{Name}.lists", (c, p, n) => Script(c, "admin-lists.sql"));
        Initializers.Add($"{Domain}.{Name}.app-parts", (c, p, n) => Script(c, "admin-app-parts.sql"));
        Initializers.Add($"{Domain}.{Name}.audit-recent", (c, p, n) => Script(c, "admin-audit-recent.sql"));
        Initializers.Add($"{Domain}.{Name}.audit", (c, p, n) => Script(c, "admin-audit.sql").Parameters.AddRange(new[]
        {
            Text("@Entity", SqlDbType.VarChar, p.TryGet("entity", out string entity) ? entity : null, 30), Id(p),
        }));
        Initializers.Add($"{Domain}.{Name}.application-save", InitializeApplicationSave);
        Initializers.Add($"{Domain}.{Name}.member-save", InitializeMemberSave);
        Initializers.Add($"{Domain}.{Name}.application-delete", (c, p, n) => Script(c, "application-delete.sql").Parameters.AddRange(new[] { Actor(p), Id(p) }));
        Initializers.Add($"{Domain}.{Name}.member-delete", (c, p, n) => Script(c, "member-delete.sql").Parameters.AddRange(new[] { Actor(p), Id(p) }));
        Initializers.Add($"{Domain}.{Name}.grant-save", InitializeGrant);
        Initializers.Add($"{Domain}.{Name}.part-save", InitializePartSave);
        Initializers.Add($"{Domain}.{Name}.part-delete", (c, p, n) => Script(c, "app-part-delete.sql").Parameters.AddRange(new[]
        {
            Actor(p), Text("@Part", SqlDbType.VarChar, (string)n["part"], 30), Int("@ApplicationId", (int?)n["applicationId"] ?? 0),
            Int("@Key", (int?)n["oldKey"] ?? 0),
        }));

        // The visitor welcome and the requests to join (gatehouse.md §11).
        Initializers.Add($"{Domain}.{Name}.welcome-choices", (c, p, n) => Script(c, "welcome-choices.sql"));
        Initializers.Add($"{Domain}.{Name}.welcome-mine", (c, p, n) => Script(c, "welcome-mine.sql").Parameters.Add(Identifier(p)));
        Initializers.Add($"{Domain}.{Name}.request-create", InitializeRequestCreate);
        Initializers.Add($"{Domain}.{Name}.requests", (c, p, n) => Script(c, "admin-requests.sql"));
        Initializers.Add($"{Domain}.{Name}.requests-pending-count", (c, p, n) => Script(c, "requests-pending-count.sql"));
        Initializers.Add($"{Domain}.{Name}.request-decide", InitializeRequestDecide);
    }

    // The identifier and Windows identity are the signed-in user's, from the parameters; never from the body.
    private static void InitializeRequestCreate(SqlCommand command, IParameters parameters, JsonNode node)
    {
        Script(command, "request-create.sql").Parameters.AddRange(new[]
        {
            Identifier(parameters),
            Text("@WindowsIdentity", SqlDbType.NVarChar, parameters.TryGet("windowsIdentity", out string windows) ? windows : null, 72),
            Text("@FirstName", SqlDbType.NVarChar, Trim(node["firstName"]), 100),
            Text("@LastName", SqlDbType.NVarChar, Trim(node["lastName"]), 100),
            Text("@Email", SqlDbType.NVarChar, Trim(node["email"]), 100),
            Text("@Reason", SqlDbType.NVarChar, Trim(node["reason"]), 1000),
            Int("@RoleId", (int)node["roleId"]),
            Text("@ApplicationIds", SqlDbType.NVarChar, node["applicationIds"].ToJsonString(), -1),
        });
    }

    private static void InitializeRequestDecide(SqlCommand command, IParameters parameters, JsonNode node)
    {
        var note = Trim(node["note"]);
        Script(command, "request-decide.sql").Parameters.AddRange(new[]
        {
            Actor(parameters), Id(parameters),
            new SqlParameter("@Approve", SqlDbType.Bit) { Value = parameters.TryGet("approve", out bool approve) && approve },
            Int("@RoleId", (int?)node["roleId"] ?? 0),
            Text("@ApplicationIds", SqlDbType.NVarChar, node["applicationIds"]?.ToJsonString() ?? "[]", -1),
            Text("@Note", SqlDbType.NVarChar, string.IsNullOrEmpty(note) ? null : note, 1000),
        });
    }

    private static void InitializeApplicationSave(SqlCommand command, IParameters parameters, JsonNode node)
    {
        var settings = (string)node["settings"];
        Script(command, "application-save.sql").Parameters.AddRange(new[]
        {
            Actor(parameters), OptionalId(parameters),
            Text("@Identifier", SqlDbType.NVarChar, Trim(node["identifier"]), 50),
            Text("@Name", SqlDbType.NVarChar, Trim(node["name"]), 100),
            Text("@Tags", SqlDbType.NVarChar, Trim(node["tags"]) ?? "", 510),
            Text("@Disposition", SqlDbType.NVarChar, Trim(node["disposition"]), 30),
            Int("@ApplicationTypeId", (int)node["applicationTypeId"]),
            Text("@Settings", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(settings) ? "{ \"settings\":null}" : settings, -1),
        });
    }

    private static void InitializeMemberSave(SqlCommand command, IParameters parameters, JsonNode node)
    {
        Script(command, "member-save.sql").Parameters.AddRange(new[]
        {
            Actor(parameters), OptionalId(parameters),
            Text("@Identifier", SqlDbType.NVarChar, Trim(node["identifier"]), 100),
            Text("@WindowsIdentity", SqlDbType.NVarChar, Trim(node["windowsIdentity"]), 72),
            Text("@FirstName", SqlDbType.NVarChar, Trim(node["firstName"]), 100),
            Text("@LastName", SqlDbType.NVarChar, Trim(node["lastName"]), 100),
            Text("@Email", SqlDbType.NVarChar, Trim(node["email"]) ?? "", 100),
        });
    }

    private static void InitializeGrant(SqlCommand command, IParameters parameters, JsonNode node)
    {
        Script(command, "grant-save.sql").Parameters.AddRange(new[]
        {
            Actor(parameters),
            Int("@MemberId", (int)node["memberId"]),
            Int("@ApplicationId", (int)node["applicationId"]),
            Int("@RoleId", (int)node["roleId"]),
            new SqlParameter("@Revoke", SqlDbType.Bit) { Value = parameters.TryGet("revoke", out bool revoke) && revoke },
        });
    }

    private static void InitializePartSave(SqlCommand command, IParameters parameters, JsonNode node)
    {
        var alias = Trim(node["alias"]);
        Script(command, "app-part-save.sql").Parameters.AddRange(new[]
        {
            Actor(parameters),
            Text("@Part", SqlDbType.VarChar, (string)node["part"], 30),
            Int("@ApplicationId", (int)node["applicationId"]),
            new SqlParameter("@OldKey", SqlDbType.Int) { Value = (object)(int?)node["oldKey"] ?? DBNull.Value },
            Int("@RoleId", (int?)node["roleId"] ?? 0),
            Text("@Alias", SqlDbType.NVarChar, string.IsNullOrEmpty(alias) ? null : alias, 100),
            Int("@StageId", (int?)node["stageId"] ?? 0),
            Text("@Name", SqlDbType.NVarChar, Trim(node["name"]) ?? "", 10),
            Int("@ServiceTypeId", (int?)node["serviceTypeId"] ?? 0),
            new SqlParameter("@StartOn", SqlDbType.Date)
            {
                Value = DateOnly.TryParse((string)node["startOn"], out var startOn) ? startOn.ToDateTime(TimeOnly.MinValue) : DBNull.Value,
            },
            Text("@Status", SqlDbType.NVarChar, Trim(node["status"]) ?? "", 50),
        });
    }

    private static SqlCommand Script(SqlCommand command, string file)
    {
        command.CommandType = CommandType.Text;
        command.CommandText = SqlScript.Load($"membership/sql/{file}");
        return command;
    }

    private static string Trim(JsonNode value) => ((string)value)?.Trim();

    private static SqlParameter Actor(IParameters parameters) =>
        Text("@Actor", SqlDbType.NVarChar, parameters.TryGet("username", out string user) ? user : null, 100);

    private static SqlParameter Identifier(IParameters parameters) =>
        Text("@Identifier", SqlDbType.NVarChar, parameters.TryGet("username", out string user) ? user : null, 100);

    private static SqlParameter Id(IParameters parameters) => Int("@Id", parameters.TryGet("id", out int id) ? id : 0);

    private static SqlParameter OptionalId(IParameters parameters) =>
        new("@Id", SqlDbType.Int) { Value = parameters.TryGet("id", out int id) ? id : DBNull.Value };

    private static SqlParameter Int(string name, int value) => new(name, SqlDbType.Int) { Value = value };

    private static SqlParameter Text(string name, SqlDbType type, string value, int size) =>
        new(name, type, size) { Value = (object)value ?? DBNull.Value };
}
