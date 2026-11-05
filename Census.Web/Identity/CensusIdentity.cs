using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Census.Web.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Census.Web.Identity;

// Who is signed in, and who they are acting as (census-on-apptrak.md §10). xf-dashboard's shape as Gatehouse ported
// it (Windows sign-in, a cached session per real user, the configured sys-admin list), with xf-dashboard's
// impersonation on top: the session is the real (canonical) user; the impersonation target is kept beside it, so the
// five-minute refresh of the session never drops it (their Finding 5). Census's rule stays: a role held on the
// Census application counts on every application.

public class IdentityOptions
{
    public const string SectionName = "Identity";

    // A resolved user is kept this long, so a grant made on the Membership page reaches its holder within minutes.
    public int SessionMinutes { get; set; } = 5;
}

public class ImpersonationOptions
{
    public const string SectionName = "Impersonation";

    // Off unless set: no View as, and the impersonate API answers 403. Stop is never gated.
    public bool IsEnabled { get; set; }

    // An impersonation left alone this long ends by itself.
    public int Hours { get; set; } = 8;
}

public static class CensusClaims
{
    public const string SystemAdministrator = "system-administrator";
    public const string AdministerPolicy = "CensusAdminister";

    public const string Identifier = "census:identifier";        // effective: who requests run as
    public const string Name = "census:name";
    public const string Canonical = "census:canonical";          // the real, signed-in user
    public const string CanonicalName = "census:canonical-name";
    public const string Session = "census:session";
    public const string Administer = "census:administer";        // the real user is a system administrator; carries through impersonation
    public const string Impersonating = "census:impersonating";
}

// The effective user writes (ChangedBy, xf-dashboard decision 011); the real one is stamped beside it when they differ.
public record Actor(string Identifier, string ImpersonatedBy);

public static class CensusPrincipal
{
    public static string Effective(this ClaimsPrincipal user) => user.FindFirstValue(CensusClaims.Identifier) ?? "census";
    public static string Canonical(this ClaimsPrincipal user) => user.FindFirstValue(CensusClaims.Canonical) ?? "census";
    public static bool IsImpersonating(this ClaimsPrincipal user) => user.HasClaim(CensusClaims.Impersonating, "true");
    public static bool CanAdminister(this ClaimsPrincipal user) => user.HasClaim(CensusClaims.Administer, "true");
    public static string SessionId(this ClaimsPrincipal user) => user.FindFirstValue(CensusClaims.Session);

    public static Actor Actor(this ClaimsPrincipal user) =>
        new(user.Effective(), user.IsImpersonating() ? user.Canonical() : null);
}

public class CensusSession
{
    public string Id { get; } = Guid.NewGuid().ToString("N");
    public string UserName { get; init; }
    public string Name { get; set; }
    public bool IsSystemAdministrator { get; set; }
}

public record ImpersonationTarget(string Identifier, string Name, DateTimeOffset StartedAt);

// The target per real user, apart from the session so a session refresh keeps it.
public class ImpersonationStore(IMemoryCache cache, IOptions<ImpersonationOptions> options)
{
    private static string Key(string canonical) => $"census:impersonating:{canonical.ToLowerInvariant()}";

    public ImpersonationTarget Get(string canonical) => cache.TryGetValue(Key(canonical), out ImpersonationTarget t) ? t : null;

    public void Set(string canonical, ImpersonationTarget target) =>
        cache.Set(Key(canonical), target, new MemoryCacheEntryOptions { Size = 1, SlidingExpiration = TimeSpan.FromHours(options.Value.Hours) });

    public void Clear(string canonical) => cache.Remove(Key(canonical));
}

public class ClaimsTransformer(
    MemberAccess members,
    ImpersonationStore impersonation,
    IMemoryCache cache,
    IOptions<IdentityOptions> identity,
    IOptions<ImpersonationOptions> impersonationOptions,
    IConfiguration configuration,
    ILogger<ClaimsTransformer> logger) : IClaimsTransformation
{
    public async Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        // Called more than once per request; the second call finds its own claims and leaves the principal alone.
        if (principal.HasClaim(c => c.Type == CensusClaims.Session)) return principal;
        if (principal.Identity is not ClaimsIdentity { IsAuthenticated: true } source) return principal;
        var username = UserName(source.Name);
        if (string.IsNullOrEmpty(username)) return principal;

        var session = await cache.GetOrCreateAsync($"census:session:{source.Name.ToLowerInvariant()}", async entry =>
        {
            entry.Size = 1;
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(identity.Value.SessionMinutes);
            var access = members.Enabled ? await members.AccessAsync(username) : null;
            var resolved = new CensusSession
            {
                UserName = access?.Member.Identifier ?? username,
                Name = access?.Member.Name is { Length: > 0 } n ? n : username,
                IsSystemAdministrator = access?.EstateRoles.Contains(CensusClaims.SystemAdministrator, StringComparer.OrdinalIgnoreCase) == true,
            };
            if (!resolved.IsSystemAdministrator && IsListedSystemAdministrator(username))
            {
                resolved.IsSystemAdministrator = true;
                logger.LogInformation("Identity: '{Username}' is a system administrator via Authorization:SystemAdministrators.", username);
            }
            return resolved;
        });

        // Honoured only while the real user may impersonate: a revoked administrator, or the switch turned off, ends it.
        var target = impersonationOptions.Value.IsEnabled && session.IsSystemAdministrator ? impersonation.Get(session.UserName) : null;

        var claims = new ClaimsIdentity(source.Claims, source.AuthenticationType, source.NameClaimType, ClaimTypes.Role);
        claims.AddClaim(new Claim(CensusClaims.Identifier, target?.Identifier ?? session.UserName));
        claims.AddClaim(new Claim(CensusClaims.Name, target?.Name ?? session.Name));
        claims.AddClaim(new Claim(CensusClaims.Canonical, session.UserName));
        claims.AddClaim(new Claim(CensusClaims.CanonicalName, session.Name));
        claims.AddClaim(new Claim(CensusClaims.Session, session.Id));
        claims.AddClaim(new Claim(CensusClaims.Administer, session.IsSystemAdministrator ? "true" : "false"));
        claims.AddClaim(new Claim(CensusClaims.Impersonating, target != null ? "true" : "false"));
        return new ClaimsPrincipal(claims);
    }

    private static string UserName(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var slash = name.IndexOf('\\');
        return (slash < 0 ? name : name[(slash + 1)..]).Trim();
    }

    private bool IsListedSystemAdministrator(string username) =>
        (configuration.GetSection("Authorization:SystemAdministrators").Get<string[]>() ?? Array.Empty<string>())
            .Any(u => string.Equals(u, username, StringComparison.OrdinalIgnoreCase));
}
