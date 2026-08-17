using System.Collections.Generic;
using Census.Web.Models.Blacklist;
using Census.Web.Models.Census;

namespace Census.Web.Models.Api;

public record SnapshotDetailDto
{
    public required CensusEnvelope Envelope { get; init; }
    public List<BlacklistHit> BlacklistHits { get; init; } = [];
}
