using System;
using System.Collections.Generic;

namespace Gatehouse.Identity;

// Who a signed-in user is in membership, resolved once and cached (gatehouse.md §5), as xf-dashboard's UserSession.
public class UserSession
{
    public string Id { get; } = Guid.NewGuid().ToString("N");
    public string Domain { get; set; }
    public string UserName { get; set; }
    public bool IsMember { get; set; }
    public string FirstName { get; set; }
    public string LastName { get; set; }
    public List<string> Roles { get; set; } = new();
    public DateTimeOffset ResolvedAt { get; } = DateTimeOffset.Now;
    public string DisplayName => IsMember ? $"{FirstName} {LastName}".Trim() : UserName;
}

public static class WindowsIdentityExtensions
{
    // "DOMAIN\username" → ("DOMAIN", "username"); a name with no domain is all username.
    public static (string Domain, string UserName) SplitWindowsIdentity(this string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return (null, null);
        var slash = name.IndexOf('\\');
        return slash < 0 ? (null, name.Trim()) : (name[..slash], name[(slash + 1)..].Trim());
    }
}
