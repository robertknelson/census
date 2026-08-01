using Census.Web.Models.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/certificates")]
public class CertificatesController(CensusStore censusStore) : ControllerBase
{
    [HttpGet]
    public ActionResult<List<CertificateRadarEntryDto>> GetCertificates([FromQuery] string? asOf)
    {
        DateOnly? asOfDate = null;
        if (asOf is not null)
        {
            if (!DateOnly.TryParseExact(asOf, "yyyy-MM-dd", out var parsed)) return BadRequest("asOf must be yyyy-MM-dd");
            asOfDate = parsed;
        }

        var now = asOfDate is { } d
            ? new DateTimeOffset(d.ToDateTime(new TimeOnly(23, 59, 59)), TimeSpan.Zero)
            : DateTimeOffset.UtcNow;

        var entries = censusStore.GetMachineDirs()
            .SelectMany(machineDir =>
            {
                var latestRef = asOfDate is { } day
                    ? censusStore.GetSnapshotRefAsOf(machineDir, day)
                    : censusStore.GetSnapshotRefs(machineDir).LastOrDefault();
                if (latestRef is null) return [];

                var envelope = censusStore.GetSnapshot(machineDir, latestRef.Date);
                var certs = envelope?.Certificates?.Data?.Certificates ?? [];

                return certs.Select(c => new CertificateRadarEntryDto
                {
                    Machine = machineDir,
                    Thumbprint = c.Thumbprint,
                    Subject = c.Subject,
                    SanDnsNames = c.SanDnsNames,
                    Issuer = c.Issuer,
                    NotAfter = c.NotAfter,
                    // Recomputed at request time — the collector's own daysUntilExpiry is only
                    // accurate as of collection time and goes stale (census-web.md §3.4).
                    DaysUntilExpiry = c.NotAfter.HasValue ? (int)Math.Floor((c.NotAfter.Value - now).TotalDays) : null,
                    BoundTo = c.BoundTo,
                    KeySize = c.KeySize,
                });
            })
            .OrderBy(c => c.DaysUntilExpiry ?? int.MaxValue)
            .ToList();

        return Ok(entries);
    }
}
