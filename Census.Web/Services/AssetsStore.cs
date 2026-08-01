using System.Text.Json;
using Census.Web.Models.Assets;
using Census.Web.Options;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

public class AssetsStore
{
    private readonly string _assetsConfigPath;

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

    public AssetsStore(IOptions<CensusOptions> options, IHostEnvironment env)
    {
        _assetsConfigPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.AssetsConfigPath));
    }

    public AssetsConfig Load()
    {
        if (!File.Exists(_assetsConfigPath)) return new AssetsConfig();
        var json = File.ReadAllText(_assetsConfigPath);
        return JsonSerializer.Deserialize<AssetsConfig>(json, ReadOptions) ?? new AssetsConfig();
    }

    public void Save(AssetsConfig config)
    {
        File.WriteAllText(_assetsConfigPath, JsonSerializer.Serialize(config, WriteOptions) + Environment.NewLine);
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
