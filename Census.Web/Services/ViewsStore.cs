using System;
using System.IO;
using System.Text.Json;
using Census.Web.Models.Views;
using Census.Web.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

public class ViewsStore
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
    public ViewsStore(AssertionDocuments documents)
    {
        _documents = documents;
    }

    public ViewsConfig Load()
    {
        var json = _documents.Read("views");
        if (json == null) return new ViewsConfig();
        return JsonSerializer.Deserialize<ViewsConfig>(json, ReadOptions) ?? new ViewsConfig();
    }

    public void Save(ViewsConfig config)
    {
        _documents.Write("views", JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine).EnsureSaved();
    }
}
