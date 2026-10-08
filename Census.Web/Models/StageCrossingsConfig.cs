using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Census.Web.Models;

/// <summary>
/// Crossings a human has said are meant (stage-crossings.md §4). Keyed by the graph's own
/// node ids for caller and target, so the acceptance follows the entities, not one edge
/// instance. Still drawn, still a crossing; out of the findings.
/// </summary>
public record StageCrossingsConfig
{
    public int Version { get; init; } = 1;
    public List<AcceptedCrossing> Accepted { get; init; } = [];

    [JsonExtensionData]
    public Dictionary<string, JsonElement> Extra { get; init; }
}

public record AcceptedCrossing
{
    public string Caller { get; init; }
    public string Target { get; init; }
    public string By { get; init; }
    public string At { get; init; }
    public string Note { get; init; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement> Extra { get; init; }
}
