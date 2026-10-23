using Microsoft.FeatureManagement;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Gatehouse.FeatureManagement.Evaluation
{
    public class SqlFeatureDefinitionProvider : IFeatureDefinitionProvider
    {
        private readonly FeatureDefinitionStore _store;

        public SqlFeatureDefinitionProvider(FeatureDefinitionStore store)
        {
            _store = store;
        }

        public async Task<FeatureDefinition> GetFeatureDefinitionAsync(string featureName)
        {
            var definitions = await _store.GetDefinitionsAsync();
            return definitions.TryGetValue(featureName, out var definition) ? definition : null;
        }

        public async IAsyncEnumerable<FeatureDefinition> GetAllFeatureDefinitionsAsync()
        {
            var definitions = await _store.GetDefinitionsAsync();
            foreach (var definition in definitions.Values)
            {
                yield return definition;
            }
        }
    }
}
