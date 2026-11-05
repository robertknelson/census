using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Census.Web.Models.EntityTags;
using Census.Web.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

public class EntityTagsStore
{
    private readonly AssertionDocuments _documents;

    private static readonly JsonSerializerOptions ReadOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    // The document is AppTrak's rows or the file, as AssertionDocuments decides (census-on-apptrak.md §6).
    public EntityTagsStore(AssertionDocuments documents)
    {
        _documents = documents;
    }

    public EntityTagsConfig Load()
    {
        var json = _documents.Read("entity-tags");
        if (json == null) return new EntityTagsConfig();
        var config = JsonSerializer.Deserialize<EntityTagsConfig>(json, ReadOptions) ?? new EntityTagsConfig();

        // A round-trip through System.Text.Json drops every dictionary's comparer, and here
        // the whole address is dictionary keys — rebuild each level case-insensitive.
        return config with { Databases = Normalize(config.Databases), Applications = Normalize(config.Applications) };
    }

    public void Save(EntityTagsConfig config)
    {
        _documents.Write("entity-tags", JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine).EnsureSaved();
    }

    private static Dictionary<string, Dictionary<string, Dictionary<string, EntityTagAssertion>>> Normalize(
        Dictionary<string, Dictionary<string, Dictionary<string, EntityTagAssertion>>> tree)
    {
        var machines = new Dictionary<string, Dictionary<string, Dictionary<string, EntityTagAssertion>>>(StringComparer.OrdinalIgnoreCase);
        foreach (var (machine, containers) in tree)
        {
            var byContainer = new Dictionary<string, Dictionary<string, EntityTagAssertion>>(StringComparer.OrdinalIgnoreCase);
            foreach (var (container, leaves) in containers ?? new Dictionary<string, Dictionary<string, EntityTagAssertion>>())
            {
                byContainer[container] = leaves is null
                    ? new Dictionary<string, EntityTagAssertion>(StringComparer.OrdinalIgnoreCase)
                    : new Dictionary<string, EntityTagAssertion>(leaves, StringComparer.OrdinalIgnoreCase);
            }
            machines[machine] = byContainer;
        }
        return machines;
    }
}
