using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Census.Web.Models;

/// <summary>
/// One system claim on an entity (entity-associations.md §2): the stages belong to the
/// claim, not to the entity — a database can serve MyFancy at dev+val and Other at val
/// only, which the old flat axes could not say. Empty Stages means "stage not asserted",
/// never "all stages". Provenance sits on the association: different people assert
/// different claims onto one entity.
/// </summary>
public record SystemAssociation
{
    public string System { get; init; }
    public List<string> Stages { get; init; } = [];

    /// <summary>
    /// The identity stage variants share within this system claim (canonical-names.md §2):
    /// "within that system, this is MyAppDB". Per-system by construction — it rides the
    /// claim. Asserted only, never inferred from name similarity (G-2). Null = ungrouped.
    /// </summary>
    public string CanonicalName { get; init; }

    /// <summary>
    /// The role this entity plays in the system's architecture (layered-view.md §3): web
    /// (server-rendered), spa, api — suggested, never restricted. Rides the claim like the
    /// canonical name. Null = unplaced; databases need none (placed by kind).
    /// </summary>
    public string Layer { get; init; }

    public string AssertedBy { get; init; }
    public string AssertedAt { get; init; }

    /// <summary>Unknown keys are future refinements — they must survive a round-trip untouched.</summary>
    [JsonExtensionData]
    public Dictionary<string, JsonElement> Extra { get; init; }
}
