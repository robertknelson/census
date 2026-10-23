using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Gatehouse.FeatureManagement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.FeatureManagement.Mvc;
using Xunit;

namespace Gatehouse.Tests;

// The UX-and-server rule (gatehouse.md §6): every action is gated by a feature or a named policy, nothing is open by
// accident, and every sidebar item names the same gate as the page behind it.
public class GateTests
{
    private static readonly Assembly Web = typeof(Program).Assembly;

    private static IEnumerable<(Type Controller, MethodInfo Action)> Actions() =>
        Web.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract)
            .SelectMany(t => t.GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
                .Where(m => !m.IsSpecialName && m.GetCustomAttribute<NonActionAttribute>() == null)
                .Select(m => (t, m)));

    private static IEnumerable<string> Gates(Type controller, MethodInfo action) =>
        new MemberInfo[] { controller, action }.SelectMany(member =>
            member.GetCustomAttributes<FeatureGateAttribute>().SelectMany(g => g.Features).Select(f => $"feature:{f}")
                .Concat(member.GetCustomAttributes<AuthorizeAttribute>().Where(a => !string.IsNullOrEmpty(a.Policy)).Select(a => $"policy:{a.Policy}")));

    [Fact]
    public void Every_action_carries_a_feature_or_a_named_policy()
    {
        var ungated = Actions().Where(a => !Gates(a.Controller, a.Action).Any()).Select(a => $"{a.Controller.Name}.{a.Action.Name}").ToList();
        Assert.True(ungated.Count == 0, $"Ungated: {string.Join(", ", ungated)}");
    }

    [Fact]
    public void Nothing_allows_anonymous_users()
    {
        var open = Actions().Where(a => a.Controller.GetCustomAttribute<AllowAnonymousAttribute>() != null || a.Action.GetCustomAttribute<AllowAnonymousAttribute>() != null)
            .Select(a => $"{a.Controller.Name}.{a.Action.Name}").ToList();
        Assert.True(open.Count == 0, $"Anonymous: {string.Join(", ", open)}");
    }

    [Fact]
    public void Every_sidebar_item_names_the_gate_of_the_page_behind_it()
    {
        var pages = Actions()
            .SelectMany(a => a.Action.GetCustomAttributes<HttpGetAttribute>().Where(h => h.Template?.StartsWith('/') == true).Select(h => (Route: h.Template, a.Controller, a.Action)))
            .ToDictionary(p => p.Route, p => Gates(p.Controller, p.Action).ToList(), StringComparer.OrdinalIgnoreCase);
        foreach (var item in Navigation.Groups.SelectMany(g => g.Items))
        {
            Assert.True(pages.ContainsKey(item.Href), $"No page at {item.Href}");
            var gates = pages[item.Href];
            if (item.Feature != null) Assert.Contains($"feature:{item.Feature}", gates);
            if (item.Policy != null) Assert.Contains($"policy:{item.Policy}", gates);
            if (item.Feature == null && item.Policy == null) Assert.Equal(new[] { $"policy:{FeatureAccessPolicies.SignedIn}" }, gates);
        }
    }

    [Fact]
    public void The_feature_access_api_is_guarded_by_the_fixed_policy_never_a_feature()
    {
        var api = Web.GetTypes().Single(t => t.Name == "FeatureAccessController");
        Assert.Equal(FeatureAccessPolicies.Admin, api.GetCustomAttribute<AuthorizeAttribute>()?.Policy);
        Assert.Empty(api.GetCustomAttributes<FeatureGateAttribute>());
        Assert.All(api.GetMethods(), m => Assert.Empty(m.GetCustomAttributes<FeatureGateAttribute>()));
    }
}
