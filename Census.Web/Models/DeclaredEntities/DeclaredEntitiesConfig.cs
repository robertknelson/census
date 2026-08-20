using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Census.Web.Models.DeclaredEntities;

/// <summary>
/// Entities a human asserts exist (declared-entities.md §3). Two anchor shapes: onMachines
/// nests machine → entity name (a scheduled task on an observed box); external stands on the
/// declaration alone, carrying the endpoint identifiers observed edges attribute to.
/// Declared records never resolve against snapshots — that is entity-tags.json's contract,
/// and keeping the two resolution semantics apart is why this is a sibling file.
/// </summary>
public record DeclaredEntitiesConfig
{
    public int Version { get; init; } = 1;
    public Dictionary<string, Dictionary<string, DeclaredEntity>> OnMachines { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, DeclaredEntity> External { get; init; } = new(StringComparer.OrdinalIgnoreCase);
}

public record DeclaredEntity
{
    /// <summary>Free-form, suggested-never-restricted (declared-entities.md §10.2).</summary>
    public string Kind { get; init; }

    /// <summary>External entities only: identifiers observed edge targets match exactly — never fuzzily (§4).</summary>
    public List<string> Endpoints { get; init; }

    /// <summary>Association shape (entity-associations.md) — same read-both rule as entity tags.</summary>
    public List<SystemAssociation> Serves { get; init; }

    // Null when absent — see EntityTagAssertion: upgraded records must not re-acquire the
    // flat axes as empty-array noise.
    public List<string> System { get; init; }
    public List<string> Stage { get; init; }
    public string Note { get; init; }
    public string AssertedBy { get; init; }
    public string AssertedAt { get; init; }

    /// <summary>Unknown keys are future axes — they must survive a GET/PUT round-trip untouched.</summary>
    [JsonExtensionData]
    public Dictionary<string, JsonElement> Extra { get; init; }
}
