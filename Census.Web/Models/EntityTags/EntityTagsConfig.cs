using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Census.Web.Models.EntityTags;

/// <summary>
/// Human assertions of meaning onto observed sub-machine entities (entity-tags.md §3).
/// The address is the nesting itself — databases: machine → instance → name,
/// applications: machine → site → app path — so no delimiter is ever composed or split.
/// </summary>
public record EntityTagsConfig
{
    public int Version { get; init; } = 1;
    public Dictionary<string, Dictionary<string, Dictionary<string, EntityTagAssertion>>> Databases { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, Dictionary<string, Dictionary<string, EntityTagAssertion>>> Applications { get; init; } = new(StringComparer.OrdinalIgnoreCase);
}

public record EntityTagAssertion
{
    public List<string> System { get; init; } = [];
    public List<string> Stage { get; init; } = [];
    public string AssertedBy { get; init; }
    public string AssertedAt { get; init; }

    /// <summary>Unknown leaf keys are future tag axes — they must survive a GET/PUT round-trip untouched.</summary>
    [JsonExtensionData]
    public Dictionary<string, JsonElement> ExtraAxes { get; init; }
}
