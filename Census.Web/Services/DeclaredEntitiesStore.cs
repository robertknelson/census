using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Census.Web.Models.DeclaredEntities;
using Census.Web.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

public class DeclaredEntitiesStore
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
    public DeclaredEntitiesStore(AssertionDocuments documents)
    {
        _documents = documents;
    }

    public DeclaredEntitiesConfig Load()
    {
        var json = _documents.Read("declared-entities");
        if (json == null) return new DeclaredEntitiesConfig();
        var config = JsonSerializer.Deserialize<DeclaredEntitiesConfig>(json, ReadOptions) ?? new DeclaredEntitiesConfig();

        // A round-trip through System.Text.Json drops every dictionary's comparer, and the
        // addresses are dictionary keys — rebuild each level case-insensitive.
        var onMachines = new Dictionary<string, Dictionary<string, DeclaredEntity>>(StringComparer.OrdinalIgnoreCase);
        foreach (var (machine, entities) in config.OnMachines ?? new Dictionary<string, Dictionary<string, DeclaredEntity>>())
        {
            onMachines[machine] = entities is null
                ? new Dictionary<string, DeclaredEntity>(StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, DeclaredEntity>(entities, StringComparer.OrdinalIgnoreCase);
        }
        var external = config.External is null
            ? new Dictionary<string, DeclaredEntity>(StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, DeclaredEntity>(config.External, StringComparer.OrdinalIgnoreCase);
        return config with { OnMachines = onMachines, External = external };
    }

    public void Save(DeclaredEntitiesConfig config)
    {
        _documents.Write("declared-entities", JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine).EnsureSaved();
    }
}
