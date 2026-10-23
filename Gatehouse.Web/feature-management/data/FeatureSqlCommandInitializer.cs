using System.Data;
using System.Text.Json.Nodes;
using Gatehouse.CommandQuery;
using Microsoft.Data.SqlClient;

namespace Gatehouse.FeatureManagement.Data;

// FM2280's reads and writes as command/query keys (gatehouse.md §6, G-R10). The controller has already checked the
// payload (Payload); here every value is a parameter.
public class FeatureSqlCommandInitializer : SqlCommandInitializer
{
    public const string Name = "feature";

    public FeatureSqlCommandInitializer()
    {
        Initializers.Add($"{Domain}.{Name}.list", (c, p, n) => Script(c, "feature-list.sql").Parameters.Add(Bit("@IncludeVoided", p.TryGet("includeVoided", out bool voided) && voided)));
        Initializers.Add($"{Domain}.{Name}.get", (c, p, n) => Script(c, "feature-get.sql").Parameters.Add(FeatureId(p)));
        Initializers.Add($"{Domain}.{Name}.audit", (c, p, n) => Script(c, "feature-audit.sql").Parameters.Add(FeatureId(p)));
        Initializers.Add($"{Domain}.{Name}.definitions", (c, p, n) => Script(c, "feature-definitions.sql"));
        Initializers.Add($"{Domain}.{Name}.roles", (c, p, n) => Script(c, "roles.sql"));
        Initializers.Add($"{Domain}.{Name}.create", InitializeCreate);
        Initializers.Add($"{Domain}.{Name}.update", InitializeUpdate);
        Initializers.Add($"{Domain}.{Name}.set-enabled", InitializeSetEnabled);
        Initializers.Add($"{Domain}.{Name}.role-grant", (c, p, n) => RoleChange(c, p, n, "role-grant.sql"));
        Initializers.Add($"{Domain}.{Name}.role-revoke", (c, p, n) => RoleChange(c, p, n, "role-revoke.sql"));
    }

    private static void InitializeCreate(SqlCommand command, IParameters parameters, JsonNode node)
    {
        Script(command, "feature-create.sql").Parameters.AddRange(new[]
        {
            Actor(parameters),
            Text("@Name", SqlDbType.VarChar, (string)node["name"], 100),
            Text("@DisplayName", SqlDbType.NVarChar, (string)node["displayName"], 150),
            Text("@Description", SqlDbType.NVarChar, (string)node["description"], 1000),
            Bit("@IsEnabled", (bool?)node["isEnabled"] ?? false),
            Text("@Roles", SqlDbType.NVarChar, node["roles"]?.ToJsonString() ?? "[]", -1),
        });
    }

    private static void InitializeUpdate(SqlCommand command, IParameters parameters, JsonNode node)
    {
        Script(command, "feature-update.sql").Parameters.AddRange(new[]
        {
            Actor(parameters), FeatureId(parameters), RowVersion(node),
            Text("@DisplayName", SqlDbType.NVarChar, (string)node["displayName"], 150),
            Text("@Description", SqlDbType.NVarChar, (string)node["description"], 1000),
        });
    }

    private static void InitializeSetEnabled(SqlCommand command, IParameters parameters, JsonNode node)
    {
        Script(command, "feature-set-enabled.sql").Parameters.AddRange(new[]
        {
            Actor(parameters), FeatureId(parameters), RowVersion(node), Bit("@IsEnabled", (bool)node["isEnabled"]),
        });
    }

    private static void RoleChange(SqlCommand command, IParameters parameters, JsonNode node, string script)
    {
        Script(command, script).Parameters.AddRange(new[]
        {
            Actor(parameters), FeatureId(parameters), Text("@RoleName", SqlDbType.VarChar, (string)node["roleName"], 100),
        });
    }

    private static SqlCommand Script(SqlCommand command, string file)
    {
        command.CommandType = CommandType.Text;
        command.CommandText = SqlScript.Load($"feature-management/sql/{file}");
        return command;
    }

    private static SqlParameter Actor(IParameters parameters) =>
        Text("@Actor", SqlDbType.NVarChar, parameters.TryGet("username", out string user) ? user : null, 100);

    private static SqlParameter FeatureId(IParameters parameters) =>
        new("@FeatureId", SqlDbType.Int) { Value = parameters.TryGet("featureId", out int id) ? id : 0 };

    private static SqlParameter RowVersion(JsonNode node) =>
        new("@RowVersion", SqlDbType.BigInt) { Value = long.TryParse((string)node["rowVersion"], out var version) ? version : 0 };

    private static SqlParameter Bit(string name, bool value) => new(name, SqlDbType.Bit) { Value = value };

    private static SqlParameter Text(string name, SqlDbType type, string value, int size) =>
        new(name, type, size) { Value = (object)value ?? System.DBNull.Value };
}
