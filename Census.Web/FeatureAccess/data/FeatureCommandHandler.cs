using Census.Web.FeatureAccess.Evaluation;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;
using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Census.Web.FeatureAccess.Data
{
    public class FeatureCommandHandler
    {
        private static readonly Regex NamePattern = new("^[a-z0-9]+([.-][a-z0-9]+)*$", RegexOptions.Compiled);

        private readonly FeatureAccessOptions _options;
        private readonly FeatureDefinitionStore _store;
        private readonly IRoleCatalog _roleCatalog;

        public FeatureCommandHandler(IOptions<FeatureAccessOptions> options, FeatureDefinitionStore store, IRoleCatalog roleCatalog)
        {
            _options = options.Value;
            _store = store;
            _roleCatalog = roleCatalog;
        }

        public async Task<FeatureResponse> ExecuteAsync(string key, string actor, int? featureId, JsonNode data)
        {
            var payload = new Payload(data);
            var parameters = new List<SqlParameter>
            {
                SqlJson.Parameter("@Actor", SqlDbType.NVarChar, actor, 100)
            };
            if (featureId.HasValue)
            {
                parameters.Add(SqlJson.Parameter("@FeatureId", SqlDbType.Int, featureId.Value));
            }

            string script;
            switch (key)
            {
                case FeatureKeys.Create:
                {
                    script = SqlScripts.FeatureCreate;
                    var name = payload.String("name", 100, required: true);
                    if (name != null && !NamePattern.IsMatch(name))
                    {
                        payload.Errors.Add("'name' must be lowercase letters and digits separated by '.' or '-', e.g. 'manager.renewals'.");
                    }
                    var roles = await ResolveRolesAsync(payload, payload.Strings("roles"));
                    parameters.Add(SqlJson.Parameter("@Name", SqlDbType.VarChar, name, 100));
                    parameters.Add(SqlJson.Parameter("@DisplayName", SqlDbType.NVarChar, payload.String("displayName", 150, required: true), 150));
                    parameters.Add(SqlJson.Parameter("@Description", SqlDbType.NVarChar, payload.String("description", 1000, required: false), 1000));
                    parameters.Add(SqlJson.Parameter("@IsEnabled", SqlDbType.Bit, payload.Bool("isEnabled", required: false)));
                    parameters.Add(SqlJson.Parameter("@Roles", SqlDbType.NVarChar, JsonSerializer.Serialize(roles), -1));
                    break;
                }
                case FeatureKeys.Update:
                    script = SqlScripts.FeatureUpdate;
                    parameters.Add(SqlJson.Parameter("@DisplayName", SqlDbType.NVarChar, payload.String("displayName", 150, required: true), 150));
                    parameters.Add(SqlJson.Parameter("@Description", SqlDbType.NVarChar, payload.String("description", 1000, required: false), 1000));
                    parameters.Add(SqlJson.Parameter("@RowVersion", SqlDbType.BigInt, payload.RowVersion()));
                    break;
                case FeatureKeys.SetEnabled:
                    script = SqlScripts.FeatureSetEnabled;
                    parameters.Add(SqlJson.Parameter("@IsEnabled", SqlDbType.Bit, payload.Bool("isEnabled", required: true)));
                    parameters.Add(SqlJson.Parameter("@RowVersion", SqlDbType.BigInt, payload.RowVersion()));
                    break;
                case FeatureKeys.Void:
                    script = SqlScripts.FeatureVoid;
                    parameters.Add(SqlJson.Parameter("@Reason", SqlDbType.NVarChar, payload.String("reason", 500, required: true), 500));
                    parameters.Add(SqlJson.Parameter("@RowVersion", SqlDbType.BigInt, payload.RowVersion()));
                    break;
                case FeatureKeys.RoleGrant:
                {
                    script = SqlScripts.RoleGrant;
                    var roleName = payload.String("roleName", 100, required: true);
                    var resolved = roleName == null ? null : (await ResolveRolesAsync(payload, new[] { roleName })).FirstOrDefault();
                    parameters.Add(SqlJson.Parameter("@RoleName", SqlDbType.VarChar, resolved, 100));
                    break;
                }
                case FeatureKeys.RoleRevoke:
                    // Not checked against the catalog, so a role the host no longer has can still be removed.
                    script = SqlScripts.RoleRevoke;
                    parameters.Add(SqlJson.Parameter("@RoleName", SqlDbType.VarChar, payload.String("roleName", 100, required: true), 100));
                    break;
                default:
                    throw new ArgumentOutOfRangeException(nameof(key), key, "Unknown feature command.");
            }

            if (payload.Errors.Count > 0)
            {
                return FeatureResponse.Invalid(string.Join(" ", payload.Errors));
            }

            try
            {
                var json = await SqlJson.ExecuteAsync(_options.ConnectionString, script, parameters);
                _store.Invalidate();
                return FeatureResponse.Ok(JsonNode.Parse(json));
            }
            catch (SqlException ex) when (ex.Number == 50404)
            {
                return FeatureResponse.NotFound(ex.Message);
            }
            catch (SqlException ex) when (ex.Number == 50409)
            {
                return FeatureResponse.Conflict(ex.Message);
            }
            catch (SqlException ex) when (ex.Number is 2601 or 2627)
            {
                return FeatureResponse.Conflict("The change conflicts with an existing record. Reload and try again.");
            }
        }

        // Matches requested roles to the host catalog case-insensitively and stores the catalog's spelling.
        private async Task<List<string>> ResolveRolesAsync(Payload payload, IEnumerable<string> requested)
        {
            var known = await _roleCatalog.GetRoleNamesAsync();
            var resolved = new List<string>();
            foreach (var role in requested)
            {
                var match = known.FirstOrDefault(k => string.Equals(k, role, StringComparison.OrdinalIgnoreCase));
                if (match == null)
                {
                    payload.Errors.Add($"'{role}' is not a known role.");
                }
                else if (!resolved.Contains(match))
                {
                    resolved.Add(match);
                }
            }
            return resolved;
        }
    }
}
