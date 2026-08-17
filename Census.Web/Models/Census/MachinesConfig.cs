using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Serialization;

namespace Census.Web.Models.Census;

public record MachineCredential
{
    /// <summary>task-identity | clixml. See census-collector.md 5.2.</summary>
    public string? Kind { get; init; }
    public string? Path { get; init; }
}

public record MachineBucket
{
    public string? Id { get; init; }
    public string? Description { get; init; }
    public MachineCredential? Credential { get; init; }
    public List<string> TrustedHosts { get; init; } = [];
}

public record MachineEntry
{
    public required string Name { get; init; }
    /// <summary>Every machine names exactly one bucket; no bucket is a config error, not a default.</summary>
    public string? Bucket { get; init; }
    public bool Expected { get; init; } = true;
    public string? Notes { get; init; }
}

public record MachinesConfig
{
    public int Version { get; init; }
    public List<MachineBucket> Buckets { get; init; } = [];
    public List<MachineEntry> Machines { get; init; } = [];

    /// <summary>Machine names alone — what most callers actually want.</summary>
    [JsonIgnore]
    public List<string> Names => Machines.Select(m => m.Name).ToList();
}
