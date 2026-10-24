using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Gatehouse.CommandQuery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.FeatureManagement;

namespace Gatehouse.FeatureManagement;

// The sidebar, declared once (gatehouse.md §6): each item names the feature that shows it, or the fixed policy that
// guards it, or neither (shown to everyone signed in). The controller behind each item carries the same feature or
// policy, so what the sidebar hides the server also refuses. CountKey names a query whose Count shows beside the item.
public record NavItem(string Label, string Href, string Feature = null, string Policy = null, string Hint = null, string CountKey = null, int? Count = null);

public record NavGroup(string Label, IReadOnlyList<NavItem> Items);

public static class Navigation
{
    public static readonly IReadOnlyList<NavGroup> Groups = new[]
    {
        new NavGroup(null, new[]
        {
            new NavItem("Home", "/", Hint: "Who you are here, and what is on for you"),
            new NavItem("Welcome", "/welcome", Policy: FeatureAccessPolicies.Visitor, Hint: "Ask to join"),
        }),
        new NavGroup("Logs", new[]
        {
            new NavItem("Log Explorer", "/logs", Feature: Features.LogsExplorer, Hint: "Requests, exceptions and messages"),
            new NavItem("Trace", "/trace", Feature: Features.LogsTrace, Hint: "One identifier's month, day and sessions"),
            new NavItem("Usage", "/usage", Feature: Features.LogsUsage, Hint: "How an application is used"),
            new NavItem("Usage summary", "/usage/summary", Feature: Features.LogsUsageSummary, Hint: "Every application's usage at once"),
            new NavItem("App events", "/app-events", Feature: Features.LogsAppEvents, Hint: "Units of business work, across systems"),
        }),
        new NavGroup("Administer", new[]
        {
            new NavItem("Membership", "/admin/membership", Feature: Features.AdminMembership, Hint: "Applications, members and their roles",
                CountKey: "membership.requests-pending-count"),
            new NavItem("Event kinds", "/admin/app-event-kinds", Feature: Features.AdminAppEventKinds, Hint: "The kinds of work the events name"),
            new NavItem("Feature access", "/admin/feature-access", Policy: FeatureAccessPolicies.Admin, Hint: "Which roles may use which features"),
        }),
    };
}

// The feature names the code uses. fm serves this one application, so the names carry no prefix (G-R9).
public static class Features
{
    public const string LogsExplorer = "logs.explorer";
    public const string LogsTrace = "logs.trace";
    public const string LogsUsage = "logs.usage";
    public const string AdminMembership = "admin.membership";
    public const string LogsAppEvents = "logs.app-events";
    public const string AdminAppEventKinds = "admin.app-event-kinds";
    public const string LogsUsageSummary = "logs.usage-summary";
}

// The declaration trimmed to what the signed-in user may open. A group left empty goes. A visitor (not a member) sees
// the welcome alone (gatehouse.md §11.1).
public class NavigationFilter(IFeatureManager features, IAuthorizationService authorization, IJsonQueryHandler queries)
{
    public async Task<IReadOnlyList<NavGroup>> VisibleAsync(ClaimsPrincipal user)
    {
        var visitor = (await authorization.AuthorizeAsync(user, FeatureAccessPolicies.Visitor)).Succeeded;
        var visible = new List<NavGroup>();
        foreach (var group in Navigation.Groups)
        {
            var items = new List<NavItem>();
            foreach (var item in group.Items)
            {
                if (visitor != (item.Policy == FeatureAccessPolicies.Visitor)) continue;
                if (item.Feature != null && !await features.IsEnabledAsync(item.Feature)) continue;
                if (item.Policy != null && !(await authorization.AuthorizeAsync(user, item.Policy)).Succeeded) continue;
                items.Add(item.CountKey == null ? item : item with { Count = await CountAsync(item.CountKey) });
            }
            if (items.Any()) visible.Add(group with { Items = items });
        }
        return visible;
    }

    private async Task<int?> CountAsync(string key)
    {
        var parameters = new Parameters();
        var (name, action) = (key.Split('.')[0], key.Split('.')[1]);
        var response = await queries.QueryAsync(parameters.CommandQuery(name, action));
        return response.IsOkay ? (int?)response.Model?["count"] : null;
    }
}
