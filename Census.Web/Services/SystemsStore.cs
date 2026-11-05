using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Census.Web.Models.Systems;
using Census.Web.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

public class SystemsStore
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
    public SystemsStore(AssertionDocuments documents)
    {
        _documents = documents;
    }

    public SystemsConfig Load()
    {
        var json = _documents.Read("systems");
        if (json == null) return new SystemsConfig();
        var config = JsonSerializer.Deserialize<SystemsConfig>(json, ReadOptions) ?? new SystemsConfig();
        // Round-trips drop the comparer; the name is the key, so rebuild case-insensitive.
        return config with
        {
            Systems = config.Systems is null
                ? new Dictionary<string, SystemRecord>(StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, SystemRecord>(config.Systems, StringComparer.OrdinalIgnoreCase),
        };
    }

    public void Save(SystemsConfig config)
    {
        _documents.Write("systems", JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine).EnsureSaved();
    }
}
