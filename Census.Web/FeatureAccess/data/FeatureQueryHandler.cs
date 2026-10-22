using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;
using System;
using System.Collections.Generic;
using System.Data;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace Census.Web.FeatureAccess.Data
{
    public class FeatureQueryHandler
    {
        private readonly FeatureAccessOptions _options;

        public FeatureQueryHandler(IOptions<FeatureAccessOptions> options)
        {
            _options = options.Value;
        }

        public async Task<FeatureResponse> QueryAsync(string key, int? featureId = null, bool includeVoided = false)
        {
            var parameters = new List<SqlParameter>();
            string script;
            switch (key)
            {
                case FeatureKeys.List:
                    script = SqlScripts.FeatureList;
                    parameters.Add(SqlJson.Parameter("@IncludeVoided", SqlDbType.Bit, includeVoided));
                    break;
                case FeatureKeys.Get:
                    script = SqlScripts.FeatureGet;
                    parameters.Add(SqlJson.Parameter("@FeatureId", SqlDbType.Int, featureId.Value));
                    break;
                case FeatureKeys.Audit:
                    script = SqlScripts.FeatureAudit;
                    parameters.Add(SqlJson.Parameter("@FeatureId", SqlDbType.Int, featureId.Value));
                    break;
                default:
                    throw new ArgumentOutOfRangeException(nameof(key), key, "Unknown feature query.");
            }

            var json = await SqlJson.ExecuteAsync(_options.ConnectionString, script, parameters);
            return json == null
                ? FeatureResponse.NotFound("Feature not found.")
                : FeatureResponse.Ok(JsonNode.Parse(json));
        }
    }
}
