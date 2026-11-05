using System;
using System.IO;
using System.Text.Json;
using Census.Web.Models.Baselines;
using Census.Web.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

public class BaselinesStore
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
    public BaselinesStore(AssertionDocuments documents)
    {
        _documents = documents;
    }

    public BaselinesConfig Load()
    {
        var json = _documents.Read("baselines");
        if (json == null) return new BaselinesConfig();
        return JsonSerializer.Deserialize<BaselinesConfig>(json, ReadOptions) ?? new BaselinesConfig();
    }

    public void Save(BaselinesConfig config)
    {
        _documents.Write("baselines", JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine).EnsureSaved();
    }
}
