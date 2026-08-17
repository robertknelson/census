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
    private readonly string _baselinesConfigPath;

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

    public BaselinesStore(IOptions<CensusOptions> options, IHostEnvironment env)
    {
        _baselinesConfigPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.BaselinesConfigPath));
    }

    public BaselinesConfig Load()
    {
        if (!File.Exists(_baselinesConfigPath)) return new BaselinesConfig();
        var json = File.ReadAllText(_baselinesConfigPath);
        return JsonSerializer.Deserialize<BaselinesConfig>(json, ReadOptions) ?? new BaselinesConfig();
    }

    public void Save(BaselinesConfig config)
    {
        File.WriteAllText(_baselinesConfigPath, JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine);
    }
}
