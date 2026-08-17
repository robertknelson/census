using System.Collections.Generic;

namespace Census.Web.Models.Api;

/// <summary>
/// The answer to "if this machine goes down, what breaks?" in system × stage terms
/// (blast-radius.md §5). Every deployment line is traceable to hosted entities and observed
/// edges; unclassified and unknown are stated, never dropped.
/// </summary>
public record BlastRadiusDto
{
    public required string Machine { get; init; }
    public List<BlastDeploymentDto> Deployments { get; init; } = [];
    public List<BlastHostedDto> UnclassifiedHosted { get; init; } = [];
    public List<BlastDependentDto> UnclassifiedDependents { get; init; } = [];

    /// <summary>Applications whose every edge into this machine is contradicted — config drift, not impact.</summary>
    public List<BlastDependentDto> Contradicted { get; init; } = [];
    public List<UnknownScopeDto> Unknowns { get; init; } = [];
}

public record BlastDeploymentDto
{
    public required string System { get; init; }   // "" = no system asserted on the contributor
    public required string Stage { get; init; }    // "" = no stage asserted
    public List<BlastHostedDto> Hosted { get; init; } = [];
    public List<BlastDependentDto> Dependents { get; init; } = [];
}

public record BlastHostedDto
{
    public required string Kind { get; init; }       // database | application
    public required string Container { get; init; }  // instance | site
    public required string Name { get; init; }
    public List<string> System { get; init; } = [];
    public List<string> Stage { get; init; } = [];
}

public record BlastDependentDto
{
    public required string Machine { get; init; }
    public required string SiteName { get; init; }
    public required string AppPath { get; init; }
    public List<string> System { get; init; } = [];
    public List<string> Stage { get; init; } = [];
    public List<BlastEdgeDto> Edges { get; init; } = [];
}

public record BlastEdgeDto
{
    public string Name { get; init; }
    public string Database { get; init; }
    public string Instance { get; init; }
    public string SourceFile { get; init; }
    public required string Verdict { get; init; }
    public string Detail { get; init; }
}
