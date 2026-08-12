namespace Census.Web.Models.Baselines;

public record BaselinesConfig
{
    public int Version { get; init; } = 1;
    public List<Baseline> Baselines { get; init; } = [];
}

/// <summary>
/// A blessed set of approved software identities plus a selector for the machines it judges
/// (approved-baseline.md §2). Materialized by value: a pointer to a golden machine would let
/// the reference drift with nothing announcing it.
/// </summary>
public record Baseline
{
    public required string Id { get; init; }
    public required string Label { get; init; }

    /// <summary>
    /// Selector over `assets.json` facets plus the reserved `class` and `machine` pseudo-keys
    /// (§4). A machine matches when, for every key present, it holds at least one listed
    /// value — so an empty selector matches the whole fleet.
    /// </summary>
    public Dictionary<string, List<string>> AppliesTo { get; init; } = new(StringComparer.OrdinalIgnoreCase);

    public bool Active { get; init; } = true;
    public string? Note { get; init; }
    public BaselineProvenance? Provenance { get; init; }
    public List<BaselineEntry> Entries { get; init; } = [];
}

/// <summary>
/// Where the set came from and when it was blessed. There is deliberately no `blessedBy` —
/// Census Web has no auth by permanent ratification, and a name nobody can populate honestly
/// is worse than no field (§3).
/// </summary>
public record BaselineProvenance
{
    public string? SourceMachine { get; init; }
    public string? SourceDate { get; init; }
    public string? BlessedUtc { get; init; }
}

public record BaselineEntry
{
    public required string DisplayName { get; init; }
    public string? Publisher { get; init; }
    public string? Architecture { get; init; }

    /// <summary>`machine` or `per-user` — the owning SID is deliberately not carried (§6.1).</summary>
    public required string InstallScope { get; init; }

    /// <summary>What the source machine had at blessing time. Provenance only, never compared (§6.3).</summary>
    public string? ObservedVersion { get; init; }

    /// <summary>
    /// Asserted, never inferred: blessing sets this on nothing (§6.4). Approved means "allowed
    /// here"; required means "must be here", and treating every blessed entry as required would
    /// make each optional tool on the source machine mandatory across the whole scope.
    /// </summary>
    public bool Required { get; init; }
}
