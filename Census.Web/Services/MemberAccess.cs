using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.Options;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using Microsoft.FeatureManagement.FeatureFilters;

namespace Census.Web.Services;

// What a member may use and which applications they see (personas.md §6): two questions, two
// answers. Features come from the member's role identifiers as Targeting groups; scope comes from
// the applications their roles are held on. A role held on the estate application counts on every
// application, so each application's features are the estate roles' plus that application's own.
public class MemberAccess(MoveItQuestions questions, IFeatureManager features, IOptions<PersonasOptions> options)
{
    private readonly string _estate = options.Value.EstateApplication;

    public bool Enabled => questions.Enabled;

    public async Task<List<MemberSummary>> MembersAsync()
    {
        var rows = await questions.RunAsync("membership/members.sql");
        return rows.GroupBy(r => (int)r["MemberId"])
            .Select(g => Summary(g.First(), g))
            .ToList();
    }

    public async Task<MemberAccessResult> AccessAsync(string identifier)
    {
        var rows = (await questions.RunAsync("membership/members.sql"))
            .Where(r => string.Equals((string)r["Identifier"], identifier, StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (rows.Count == 0) return null;

        var grants = rows.Where(r => r["Role"] != null).ToList();
        var estateRoles = grants.Where(IsEstate).Select(r => (string)r["Role"]).Distinct().ToList();
        var registry = await questions.RunAsync("membership/applications.sql");

        var seen = estateRoles.Count > 0
            ? registry.Where(a => !string.Equals((string)a["Identifier"], _estate, StringComparison.OrdinalIgnoreCase))
                .Select(a => ((int)a["ApplicationId"], (string)a["Name"]))
            : grants.Where(r => !IsEstate(r))
                .Select(r => ((int)r["ApplicationId"], (string)r["ApplicationName"]))
                .Distinct();

        var evaluated = new Dictionary<string, List<string>>();
        async Task<List<string>> On(IEnumerable<string> roles)
        {
            var groups = roles.Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(r => r, StringComparer.OrdinalIgnoreCase).ToList();
            var key = string.Join("|", groups);
            if (evaluated.TryGetValue(key, out var cached)) return cached;
            var context = new TargetingContext { UserId = identifier, Groups = groups };
            var on = new List<string>();
            await foreach (var name in features.GetFeatureNamesAsync())
            {
                if (await features.IsEnabledAsync(name, context)) on.Add(name);
            }
            return evaluated[key] = on;
        }

        var applications = new List<ApplicationAccess>();
        foreach (var (id, name) in seen.OrderBy(a => a.Item2, StringComparer.OrdinalIgnoreCase))
        {
            var own = grants.Where(r => !IsEstate(r) && (int)r["ApplicationId"] == id).Select(r => (string)r["Role"]).ToList();
            applications.Add(new ApplicationAccess
            {
                ApplicationId = id,
                Name = name,
                Roles = own.Distinct().ToList(),
                Features = await On(estateRoles.Concat(own)),
            });
        }

        var estateFeatures = await On(estateRoles);
        var summary = Summary(rows[0], rows);
        return new MemberAccessResult
        {
            Member = summary,
            Estate = estateRoles.Count > 0,
            EstateRoles = estateRoles,
            EstateFeatures = estateFeatures,
            Features = estateFeatures.Concat(applications.SelectMany(a => a.Features)).Distinct().OrderBy(f => f, StringComparer.Ordinal).ToList(),
            Applications = applications,
        };
    }

    private bool IsEstate(Dictionary<string, object> row) =>
        string.Equals((string)row["Application"], _estate, StringComparison.OrdinalIgnoreCase);

    private static MemberSummary Summary(Dictionary<string, object> first, IEnumerable<Dictionary<string, object>> rows) => new()
    {
        Identifier = (string)first["Identifier"],
        Name = $"{first["FirstName"]} {first["LastName"]}".Trim(),
        WindowsIdentity = (string)first["WindowsIdentity"],
        Grants = rows.Where(r => r["Role"] != null)
            .Select(r => new RoleGrant { Role = (string)r["Role"], ApplicationId = (int)r["ApplicationId"], Application = (string)r["ApplicationName"] })
            .ToList(),
    };
}

public class MemberSummary
{
    public string Identifier { get; init; }
    public string Name { get; init; }
    public string WindowsIdentity { get; init; }
    public List<RoleGrant> Grants { get; init; }
}

public class RoleGrant
{
    public string Role { get; init; }
    public int ApplicationId { get; init; }
    public string Application { get; init; }
}

public class MemberAccessResult
{
    public MemberSummary Member { get; init; }
    public bool Estate { get; init; }
    public List<string> EstateRoles { get; init; }
    public List<string> EstateFeatures { get; init; }
    public List<string> Features { get; init; }
    public List<ApplicationAccess> Applications { get; init; }
}

public class ApplicationAccess
{
    public int ApplicationId { get; init; }
    public string Name { get; init; }
    public List<string> Roles { get; init; }
    public List<string> Features { get; init; }
}
