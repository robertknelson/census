using System;
using System.IO;
using System.Text.Json;
using Census.Web.Models;
using Census.Web.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

public class StageCrossingsStore
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
    public StageCrossingsStore(AssertionDocuments documents)
    {
        _documents = documents;
    }

    public StageCrossingsConfig Load()
    {
        var json = _documents.Read("stage-crossings");
        if (json == null) return new StageCrossingsConfig();
        var config = JsonSerializer.Deserialize<StageCrossingsConfig>(json, ReadOptions) ?? new StageCrossingsConfig();
        return config with { Accepted = config.Accepted ?? [] };
    }

    public void Save(StageCrossingsConfig config)
    {
        _documents.Write("stage-crossings", JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine).EnsureSaved();
    }
}
