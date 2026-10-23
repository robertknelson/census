using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.FeatureManagement.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Gatehouse.FeatureManagement.Evaluation
{
    public record FeatureGateReference(string Feature, IReadOnlyList<string> Locations);

    public record FeatureGateScanReport(
        IReadOnlyList<FeatureGateReference> Referenced,
        IReadOnlyList<FeatureGateReference> Undefined,
        IReadOnlyList<string> Unreferenced);

    // Compares [FeatureGate] names on MVC actions with defined (non-voided) features.
    // Names used only in <feature> tag helpers or JavaScript show up as unreferenced, not as errors.
    public class FeatureGateScanner
    {
        private readonly IActionDescriptorCollectionProvider _actions;
        private readonly FeatureDefinitionStore _store;

        public FeatureGateScanner(IActionDescriptorCollectionProvider actions, FeatureDefinitionStore store)
        {
            _actions = actions;
            _store = store;
        }

        public async Task<FeatureGateScanReport> ScanAsync()
        {
            var references = _actions.ActionDescriptors.Items
                .SelectMany(action => action.EndpointMetadata
                    .OfType<FeatureGateAttribute>()
                    .SelectMany(gate => gate.Features)
                    .Select(feature => (Feature: feature, Location: action.DisplayName)))
                .GroupBy(reference => reference.Feature, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    group => group.Key,
                    group => group.Select(reference => reference.Location).Distinct().OrderBy(location => location).ToList(),
                    StringComparer.OrdinalIgnoreCase);

            var defined = await _store.GetDefinitionsAsync();

            var referenced = references
                .OrderBy(reference => reference.Key)
                .Select(reference => new FeatureGateReference(reference.Key, reference.Value))
                .ToList();
            var undefined = referenced
                .Where(reference => !defined.ContainsKey(reference.Feature))
                .ToList();
            var unreferenced = defined.Keys
                .Where(name => !references.ContainsKey(name))
                .OrderBy(name => name)
                .ToList();

            return new FeatureGateScanReport(referenced, undefined, unreferenced);
        }
    }
}
