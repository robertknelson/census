namespace Census.Web.Models.Blacklist;

public record BlacklistConfig
{
    public int Version { get; init; }
    public List<BlacklistRule> Rules { get; init; } = [];
}

public record BlacklistRule
{
    public required string Id { get; init; }
    public required string Target { get; init; }
    public required BlacklistMatch Match { get; init; }
    public BlacklistVersionConstraint? Version { get; init; }
    public required string Severity { get; init; }
    public required string Reason { get; init; }
    public bool Active { get; init; } = true;
}

public record BlacklistMatch
{
    public required string Field { get; init; }
    public required string MatchType { get; init; }
    public required string Value { get; init; }
}

public record BlacklistVersionConstraint
{
    public required string Op { get; init; }
    public required string Value { get; init; }
}
