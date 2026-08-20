using System.Collections.Generic;

namespace Census.Web.Models.Api;

/// <summary>
/// One machine's entity assertions resolved against a snapshot (entity-tags.md §4).
/// Statuses are the collector's own category statuses — "not-collected" when the
/// category is absent — because a rollup must never quietly shrink on a failed
/// collection: not-ok means unknown, not empty.
/// </summary>
public record MachineEntityTagsDto
{
    public required string Machine { get; init; }
    public required string SqlStatus { get; init; }
    public required string IisStatus { get; init; }
    public List<EntityTagRowDto> Rows { get; init; } = [];
    public required EntityRollupDto Rollup { get; init; }

    /// <summary>Observed user databases and applications with no assertion — the triage queue's pile.</summary>
    public List<UnclassifiedEntityDto> Unclassified { get; init; } = [];
    public int UnclassifiedCount { get; init; }

    /// <summary>Scopes where collection failed — rendered as explicit unknown rows, never as a thinner queue.</summary>
    public List<UnknownScopeDto> Unknown { get; init; } = [];

    /// <summary>
    /// Entities a human declared onto this machine (declared-entities.md §5) — never
    /// resolved against the snapshot and never corroborated; existence is the assertion.
    /// Untagged ones count toward UnclassifiedCount.
    /// </summary>
    public List<DeclaredEntityRowDto> Declared { get; init; } = [];
}

public record DeclaredEntityRowDto
{
    public string Kind { get; init; }
    public required string Name { get; init; }
    public List<string> System { get; init; } = [];
    public List<string> Stage { get; init; } = [];
    public string Note { get; init; }
    public string AssertedBy { get; init; }
    public string AssertedAt { get; init; }
}

public record UnclassifiedEntityDto
{
    public required string Kind { get; init; }       // database | application
    public required string Container { get; init; }
    public required string Name { get; init; }
}

public record UnknownScopeDto
{
    public required string Kind { get; init; }       // sql | iis | instance
    public string Container { get; init; }           // instance name for kind=instance
    public required string Status { get; init; }
    public int UnverifiableCount { get; init; }
}

public record TriageDto
{
    public List<MachineEntityTagsDto> Machines { get; init; } = [];

    /// <summary>Distinct values already in use — suggestion chips, never a restriction.</summary>
    public List<string> Systems { get; init; } = [];
    public List<string> Stages { get; init; } = [];
    public int UnclassifiedTotal { get; init; }

    /// <summary>Declared-entity kinds in use plus the stock suggestions — chips for the declare form.</summary>
    public List<string> Kinds { get; init; } = [];

    /// <summary>Every machine the estate knows — the declare gesture's anchor picker.</summary>
    public List<string> MachineNames { get; init; } = [];
}

public record EntityTagRowDto
{
    public required string Kind { get; init; }       // database | application
    public required string Container { get; init; }  // instance name | site name
    public required string Name { get; init; }       // database name | app path
    public List<string> System { get; init; } = [];
    public List<string> Stage { get; init; } = [];
    public string AssertedBy { get; init; }
    public string AssertedAt { get; init; }

    /// <summary>
    /// observed — the entity is in the snapshot; dangling — the snapshot positively lacks
    /// it; unknown — collection failed at some level, so absence is not evidence.
    /// </summary>
    public required string Resolution { get; init; }
}

public record EntityRollupDto
{
    public List<string> Systems { get; init; } = [];
    public List<string> Stages { get; init; } = [];

    /// <summary>The assertions the rollup is derived from — a rollup is only ever true *and traceable*.</summary>
    public List<EntityTagRowDto> DerivedFrom { get; init; } = [];
}
