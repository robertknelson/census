using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models;

namespace Census.Web.Services;

/// <summary>
/// The read-both rule (entity-associations.md §3): legacy flat axes are interpreted as
/// the cross-product they always meant — forever — and a leaf carrying both shapes reads
/// as legacy-converted-then-merged. Writers emit associations; this is the only place the
/// conversion lives.
/// </summary>
public static class Associations
{
    public static List<SystemAssociation> Of(List<SystemAssociation> serves, List<string> legacySystems, List<string> legacyStages, string leafAssertedBy, string leafAssertedAt)
    {
        var merged = new List<SystemAssociation>();
        foreach (var assoc in FromLegacy(legacySystems, legacyStages, leafAssertedBy, leafAssertedAt))
            Merge(merged, assoc, overwriteProvenance: false);
        foreach (var assoc in serves ?? [])
        {
            if (assoc is null) continue;
            // Hand-edited config is a boundary: an entry may omit the system or stages key
            // (or write an explicit null, which beats the model default — the 08-14 wound).
            // Normalize here, once, so no consumer ever sees a null.
            Merge(merged, assoc with { System = assoc.System ?? "", Stages = assoc.Stages ?? [] }, overwriteProvenance: true);
        }
        return merged;
    }

    /// <summary>
    /// The flat shape meant "these systems, each at all these stages". A stage-only leaf
    /// (legal under the old model) becomes one association with an empty system — kept,
    /// because dropping it would silently discard an assertion someone made.
    /// </summary>
    private static IEnumerable<SystemAssociation> FromLegacy(List<string> systems, List<string> stages, string assertedBy, string assertedAt)
    {
        systems ??= [];
        stages ??= [];
        if (systems.Count == 0 && stages.Count == 0) yield break;
        if (systems.Count == 0)
        {
            yield return new SystemAssociation { System = "", Stages = [.. stages], AssertedBy = assertedBy, AssertedAt = assertedAt };
            yield break;
        }
        foreach (var system in systems)
            yield return new SystemAssociation { System = system, Stages = [.. stages], AssertedBy = assertedBy, AssertedAt = assertedAt };
    }

    private static void Merge(List<SystemAssociation> into, SystemAssociation assoc, bool overwriteProvenance)
    {
        var existing = into.FindIndex(a => string.Equals(a.System ?? "", assoc.System ?? "", StringComparison.OrdinalIgnoreCase));
        if (existing < 0)
        {
            into.Add(assoc);
            return;
        }
        var union = into[existing].Stages
            .Concat(assoc.Stages ?? [])
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        into[existing] = (overwriteProvenance ? assoc : into[existing]) with { Stages = union };
    }

    /// <summary>Each association contributes its own (system × stages) pairs — no cross-product across associations. Empty stages pair as ("system", "").</summary>
    public static IEnumerable<(string System, string Stage)> Pairs(List<SystemAssociation> serves) =>
        serves.SelectMany(a => (a.Stages is { Count: > 0 } ? a.Stages : new List<string> { "" }).Select(s => (a.System ?? "", s)));

    public static List<string> SystemsOf(List<SystemAssociation> serves) =>
        serves.Select(a => a.System).Where(s => !string.IsNullOrEmpty(s))
            .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(s => s, StringComparer.OrdinalIgnoreCase).ToList();

    public static List<string> StagesOf(List<SystemAssociation> serves) =>
        serves.SelectMany(a => a.Stages ?? []).Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(s => s, StringComparer.OrdinalIgnoreCase).ToList();
}
