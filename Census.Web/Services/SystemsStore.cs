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

    public SystemsStore(IOptions<CensusOptions> options, IHostEnvironment env)
    {
        _configPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.SystemsConfigPath));
    }

    public SystemsConfig Load()
    {
        if (!File.Exists(_configPath)) return new SystemsConfig();
        var json = File.ReadAllText(_configPath);
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
        File.WriteAllText(_configPath, JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine);
    }
}
