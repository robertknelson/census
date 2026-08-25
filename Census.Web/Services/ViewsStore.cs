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
    private readonly string _configPath;

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

    public ViewsStore(IOptions<CensusOptions> options, IHostEnvironment env)
    {
        _configPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.ViewsConfigPath));
    }

    public ViewsConfig Load()
    {
        if (!File.Exists(_configPath)) return new ViewsConfig();
        var json = File.ReadAllText(_configPath);
        return JsonSerializer.Deserialize<ViewsConfig>(json, ReadOptions) ?? new ViewsConfig();
    }

    public void Save(ViewsConfig config)
    {
        File.WriteAllText(_configPath, JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine);
    }
}
