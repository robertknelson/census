namespace Census.Web.Models.Blacklist;

public record BlacklistHit
{
    public required string RuleId { get; init; }
    public required string Severity { get; init; }
    public required string Reason { get; init; }
    public required string Target { get; init; }
    public required string MatchedName { get; init; }
    public string MatchedVersion { get; init; }
    public bool VersionUnparseable { get; init; }
}
