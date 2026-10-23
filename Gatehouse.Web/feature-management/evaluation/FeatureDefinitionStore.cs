using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Gatehouse.CommandQuery;
using Gatehouse.FeatureManagement.Data;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;

namespace Gatehouse.FeatureManagement.Evaluation;

// FM2280's definition store, reading through command/query (G-R10): every live feature, its switch and its roles,
// cached briefly and dropped on every write so the admin page's changes apply at once.
public class FeatureDefinitionStore(IMemoryCache cache, IOptions<FeatureAccessOptions> options, IServiceScopeFactory scopes)
{
    private const string CacheKey = "fm2280:feature-definitions";
    private const string TargetingFilterName = "Microsoft.Targeting";

    public async Task<IReadOnlyDictionary<string, FeatureDefinition>> GetDefinitionsAsync()
    {
        if (cache.TryGetValue(CacheKey, out IReadOnlyDictionary<string, FeatureDefinition> definitions)) return definitions;
        definitions = await LoadAsync();
        cache.Set(CacheKey, definitions, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = options.Value.DefinitionCacheDuration });
        return definitions;
    }

    public void Invalidate() => cache.Remove(CacheKey);

    private async Task<IReadOnlyDictionary<string, FeatureDefinition>> LoadAsync()
    {
        // The store is a singleton; the handler is scoped like the rest of command/query.
        using var scope = scopes.CreateScope();
        var queries = scope.ServiceProvider.GetRequiredService<FeatureQueryHandler>();
        var parameters = new Parameters();
        parameters.CommandQuery(FeatureSqlCommandInitializer.Name, "definitions");
        var response = await queries.QueryAsync(parameters);
        if (!response.IsOkay) throw new InvalidOperationException($"Feature definitions could not be read: {response.Status.Message}");
        return response.Items.OfType<JsonObject>().ToDictionary(
            f => (string)f["name"],
            f => CreateDefinition((string)f["name"], (bool)f["isEnabled"], (f["roles"] as JsonArray ?? new JsonArray()).Select(r => (string)r).ToList()),
            StringComparer.OrdinalIgnoreCase);
    }

    // Roles become a Targeting audience of groups; no roles means no filter, which evaluates off.
    private static FeatureDefinition CreateDefinition(string name, bool isEnabled, List<string> roles)
    {
        var filters = new List<FeatureFilterConfiguration>();
        if (roles.Count > 0)
        {
            var audience = new Dictionary<string, string> { ["Audience:DefaultRolloutPercentage"] = "0" };
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
