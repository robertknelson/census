using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Census.Web.Models.Assets;
using Census.Web.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

public class AssetsStore
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
    public AssetsStore(AssertionDocuments documents)
    {
        _documents = documents;
    }

    public AssetsConfig Load()
    {
        var json = _documents.Read("assets");
        if (json == null) return new AssetsConfig();
        return JsonSerializer.Deserialize<AssetsConfig>(json, ReadOptions) ?? new AssetsConfig();
    }

    public void Save(AssetsConfig config)
    {
        _documents.Write("assets", JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine).EnsureSaved();
    }

    /// <summary>Facets for a machine; empty (never null) when unassigned.</summary>
    public Dictionary<string, List<string>> FacetsFor(AssetsConfig config, string machine) =>
        config.Assets.TryGetValue(machine, out var entry) ? entry.Facets : [];

    /// <summary>The machine's values for the ownership key, or empty when none apply.</summary>
    public List<string> OwnershipValuesFor(AssetsConfig config, string machine)
    {
        if (config.Ownership is null) return [];
        var facets = FacetsFor(config, machine);
        return facets.TryGetValue(config.Ownership.Key, out var values) ? values : [];
    }
}
