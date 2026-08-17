using System;
using System.Collections.Generic;

namespace Census.Web.Models.Api;

public record CertificateRadarEntryDto
{
    public required string Machine { get; init; }
    public required string Thumbprint { get; init; }
    public string? Subject { get; init; }
    public List<string> SanDnsNames { get; init; } = [];
    public string? Issuer { get; init; }
    public DateTimeOffset? NotAfter { get; init; }
    public int? DaysUntilExpiry { get; init; }
    public List<string> BoundTo { get; init; } = [];
    public int? KeySize { get; init; }
}
