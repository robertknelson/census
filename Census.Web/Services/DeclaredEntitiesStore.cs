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

    public DeclaredEntitiesStore(IOptions<CensusOptions> options, IHostEnvironment env)
    {
        _configPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.DeclaredEntitiesConfigPath));
    }

    public DeclaredEntitiesConfig Load()
    {
        if (!File.Exists(_configPath)) return new DeclaredEntitiesConfig();
        var json = File.ReadAllText(_configPath);
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
        File.WriteAllText(_configPath, JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine);
    }
}
