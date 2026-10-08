using System;
using System.Collections.Generic;
using System.Linq;

namespace Census.Web.Services;

/// <summary>
/// The one comparer for an edge whose two ends share no stage (stage-crossings.md §2): the
/// caller's stage set against the target's, direction read from <see cref="StageOrder"/>.
/// Static like StageOrder, so every surface — the graph, findings, hosting, blast radius —
/// gets the same answer from the same code.
/// </summary>
public static class StageCrossing
{
    public const string Down = "down";
    public const string Up = "up";
    public const string Mixed = "mixed";
    public const string Unordered = "unordered";

    /// <summary>Direction null means the ends share a stage; Unjudged means an end had no stage to compare.</summary>
    public record Reading(string Direction, bool Unjudged);

    public static Reading Judge(IReadOnlyCollection<string> caller, IReadOnlyCollection<string> target)
    {
        if (caller is null || target is null || caller.Count == 0 || target.Count == 0) return new Reading(null, true);
        if (caller.Any(c => target.Contains(c, StringComparer.OrdinalIgnoreCase))) return new Reading(null, false);
        // A stage the order does not name has no rank; a crossing that involves one has no
        // direction to state — said as unordered, never guessed from the alphabet.
        if (caller.Any(s => !StageOrder.IsNamed(s)) || target.Any(s => !StageOrder.IsNamed(s))) return new Reading(Unordered, false);
        var allBelow = target.All(t => caller.All(c => StageOrder.Compare(t, c) < 0));
        var allAbove = target.All(t => caller.All(c => StageOrder.Compare(t, c) > 0));
        return new Reading(allBelow ? Down : allAbove ? Up : Mixed, false);
    }

    /// <summary>The loudest reading first — the order a merged canonical edge keeps (stage-crossings.md §7.3).</summary>
    public static int Rank(string direction) => direction switch
    {
        Down => 0,
        Up => 1,
        Mixed => 2,
        Unordered => 3,
        _ => 4,
    };

    /// <summary>The words a finding title and an inspector line share.</summary>
    public static string Phrase(string direction) => direction switch
    {
        Down => "calls a lower stage",
        Up => "calls a higher stage",
        Mixed => "calls across stages",
        Unordered => "calls a stage outside the order",
        _ => null,
    };
}
