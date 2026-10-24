using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Gatehouse.Identity;

// xf-dashboard's ClaimsTransformer, without impersonation (gatehouse.md §5, G-R2, G-R11): DOMAIN\username → username,
// a cached session per user resolved by the auth provider, the roles as ClaimTypes.Role claims (FM2280's targeting
// groups), and the configured sys-admin list.
public class ClaimsTransformer(
    IAuthProvider authProvider,
    IMemoryCache cache,
    IOptions<IdentityOptions> options,
    IConfiguration configuration,
    ILogger<ClaimsTransformer> logger) : IClaimsTransformation
{
    public const string SystemAdministrator = "system-administrator";
    public const string IdentifierClaim = "identifier";
    public const string DisplayNameClaim = "display-name";
    public const string SessionClaim = "session";
    // "true" for a membership.Member, "false" for a visitor, who is offered the welcome (gatehouse.md §11.1).
    public const string MemberClaim = "member";

    public async Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        // Called more than once per request; the second call finds its own claims and leaves the principal alone.
        if (principal.HasClaim(c => c.Type == SessionClaim)) return principal;
        var name = principal.Identity?.Name;
        var (domain, username) = name.SplitWindowsIdentity();
        if (string.IsNullOrEmpty(username)) return principal;

        var session = await cache.GetOrCreateAsync($"gatehouse:session:{name.ToLowerInvariant()}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(options.Value.SessionMinutes);
            var resolved = new UserSession { Domain = domain, UserName = username };
            await authProvider.ResolveAsync(resolved);
            if (IsListedSystemAdministrator(username) && !resolved.Roles.Contains(SystemAdministrator))
            {
                resolved.Roles.Add(SystemAdministrator);
                logger.LogInformation("ClaimsTransformer: '{Username}' granted '{Role}' via Authorization:SystemAdministrators.", username, SystemAdministrator);
            }
            return resolved;
        });

        if (principal.Identity is not ClaimsIdentity source) return principal;
        var identity = new ClaimsIdentity(source.Claims, source.AuthenticationType, source.NameClaimType, ClaimTypes.Role);
        foreach (var role in session.Roles) identity.AddClaim(new Claim(ClaimTypes.Role, role));
        identity.AddClaim(new Claim(IdentifierClaim, session.UserName));
        identity.AddClaim(new Claim(DisplayNameClaim, session.DisplayName));
        identity.AddClaim(new Claim(SessionClaim, session.Id));
        identity.AddClaim(new Claim(MemberClaim, session.IsMember ? "true" : "false"));
        return new ClaimsPrincipal(identity);
    }

    private bool IsListedSystemAdministrator(string username) =>
        (configuration.GetSection("Authorization:SystemAdministrators").Get<string[]>() ?? Array.Empty<string>())
            .Any(u => string.Equals(u, username, StringComparison.OrdinalIgnoreCase));
}
