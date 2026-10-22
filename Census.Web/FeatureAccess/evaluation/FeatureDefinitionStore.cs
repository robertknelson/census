using Census.Web.FeatureAccess.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Census.Web.FeatureAccess.Evaluation
{
    public class FeatureDefinitionStore
    {
        private const string CacheKey = "fm2280:feature-definitions";
        private const string TargetingFilterName = "Microsoft.Targeting";

        private readonly IMemoryCache _cache;
        private readonly FeatureAccessOptions _options;

        public FeatureDefinitionStore(IMemoryCache cache, IOptions<FeatureAccessOptions> options)
        {
            _cache = cache;
            _options = options.Value;
        }

        public async Task<IReadOnlyDictionary<string, FeatureDefinition>> GetDefinitionsAsync()
        {
            if (_cache.TryGetValue(CacheKey, out IReadOnlyDictionary<string, FeatureDefinition> definitions))
            {
                return definitions;
            }

            definitions = await LoadAsync();
            _cache.Set(CacheKey, definitions, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = _options.DefinitionCacheDuration, Size = 1 });
            return definitions;
        }

        public void Invalidate() => _cache.Remove(CacheKey);

        private async Task<IReadOnlyDictionary<string, FeatureDefinition>> LoadAsync()
        {
            var features = new Dictionary<int, (string Name, bool IsEnabled, List<string> Roles)>();

            await using var connection = new SqlConnection(_options.ConnectionString);
            await using var command = new SqlCommand(SqlScripts.Load(SqlScripts.FeatureDefinitions), connection);
            await connection.OpenAsync();
            await using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                features[reader.GetInt32(0)] = (reader.GetString(1), reader.GetBoolean(2), new List<string>());
            }

            await reader.NextResultAsync();
            while (await reader.ReadAsync())
            {
                features[reader.GetInt32(0)].Roles.Add(reader.GetString(1));
            }

            return features.Values.ToDictionary(
                f => f.Name,
                f => CreateDefinition(f.Name, f.IsEnabled, f.Roles),
                StringComparer.OrdinalIgnoreCase);
        }

        // Roles become a Targeting audience of groups; no roles means no filter, which evaluates off.
        private static FeatureDefinition CreateDefinition(string name, bool isEnabled, List<string> roles)
        {
            var filters = new List<FeatureFilterConfiguration>();
            if (roles.Count > 0)
            {
                var audience = new Dictionary<string, string>
                {
                    ["Audience:DefaultRolloutPercentage"] = "0"
                };
                for (var i = 0; i < roles.Count; i++)
                {
                    audience[$"Audience:Groups:{i}:Name"] = roles[i];
                    audience[$"Audience:Groups:{i}:RolloutPercentage"] = "100";
                }

                filters.Add(new FeatureFilterConfiguration
                {
                    Name = TargetingFilterName,
                    Parameters = new ConfigurationBuilder().AddInMemoryCollection(audience).Build()
                });
            }

            return new FeatureDefinition
            {
                Name = name,
                Status = isEnabled ? FeatureStatus.Conditional : FeatureStatus.Disabled,
                RequirementType = RequirementType.Any,
                EnabledFor = filters
            };
        }
    }
}
