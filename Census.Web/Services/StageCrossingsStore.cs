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

    public StageCrossingsStore(IOptions<CensusOptions> options, IHostEnvironment env)
    {
        _configPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.StageCrossingsConfigPath));
    }

    public StageCrossingsConfig Load()
    {
        if (!File.Exists(_configPath)) return new StageCrossingsConfig();
        var config = JsonSerializer.Deserialize<StageCrossingsConfig>(File.ReadAllText(_configPath), ReadOptions) ?? new StageCrossingsConfig();
        return config with { Accepted = config.Accepted ?? [] };
    }

    public void Save(StageCrossingsConfig config)
    {
        File.WriteAllText(_configPath, JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine);
    }
}
