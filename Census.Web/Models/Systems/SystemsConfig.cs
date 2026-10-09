using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Census.Web.Models.Systems;

/// <summary>
/// Identity for the names associations share (systems-registry.md): a name card per
/// system — description, note, expected stages. Deliberately never membership: which
/// entities serve a system lives solely in their associations, and a registry that owned
/// members would be dual truth.
/// </summary>
public record SystemsConfig
{
    public int Version { get; init; } = 1;
    public Dictionary<string, SystemRecord> Systems { get; init; } = new(StringComparer.OrdinalIgnoreCase);
}

public record SystemRecord
{
    public string Description { get; init; }

    /// <summary>Optional completeness claim: stages this system is supposed to have. Absent = no claim.</summary>
    public List<string> ExpectedStages { get; init; }

    public string Note { get; init; }

    /// <summary>A system every other system calls — logging, health, auth (cross-cutting-systems.md).
    /// Asserted here, never inferred; in other systems' graphs its members fold into one capsule per stage.</summary>
    public bool? CrossCutting { get; init; }

    public string AssertedBy { get; init; }
    public string AssertedAt { get; init; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement> Extra { get; init; }
}
