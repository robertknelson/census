using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Census.Web.Models.Views;

/// <summary>
/// Built Atlas views as an estate artifact (system-view.md §3, promoted from localStorage
/// on the 2026-08-25 ratification): the shared tab set — name, system, stage filter,
/// strategy, node positions. Which tab a browser has open stays personal (localStorage).
/// </summary>
public record ViewsConfig
{
    public int Version { get; init; } = 1;
    public List<ViewRecord> Views { get; init; } = [];
}

public record ViewRecord
{
    public string Id { get; init; }
    public string Name { get; init; }
    public string System { get; init; }
    public List<string> Stages { get; init; } = [];
    public string Strategy { get; init; }

    /// <summary>Keyed by graph node id; pinned marks a hand-dragged node.</summary>
    public Dictionary<string, ViewPosition> Positions { get; init; } = new();

    [JsonExtensionData]
    public Dictionary<string, JsonElement> Extra { get; init; }
}

public record ViewPosition
{
    public double X { get; init; }
    public double Y { get; init; }
    public bool Pinned { get; init; }
}
