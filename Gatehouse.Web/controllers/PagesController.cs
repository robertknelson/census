using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Gatehouse.FeatureManagement;
using Gatehouse.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.FeatureManagement;
using Microsoft.FeatureManagement.Mvc;

namespace Gatehouse.Web.Controllers;

// Every page carries the feature or the policy its nav item names (gatehouse.md §6): what the sidebar hides, the
// server refuses. The gate test (Gatehouse.Tests) fails on any action that carries neither.

[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
public class HomeController(IFeatureManager features) : Controller
{
    [HttpGet("/")]
    public async Task<IActionResult> Index()
    {
        var on = new System.Collections.Generic.List<(string Name, bool On)>();
        await foreach (var name in features.GetFeatureNamesAsync()) on.Add((name, await features.IsEnabledAsync(name)));
        ViewData["Features"] = on.OrderBy(f => f.Name).ToList();
        ViewData["Roles"] = User.FindAll(ClaimTypes.Role).Select(c => c.Value).OrderBy(r => r).ToList();
        return View();
    }

    [HttpGet("/error")]
    public IActionResult Error() => View();
}

[Authorize(Policy = FeatureAccessPolicies.Admin)]
public class FeatureAccessPageController : Controller
{
    [HttpGet("/admin/feature-access")]
    public IActionResult Index() => View("~/feature-management/views/FeatureAccess.cshtml");
}

// The slices still to come (gatehouse.md §9): each page is already gated as it will be, so switching its feature or
// granting it shows the nav item and opens the page, as the finished one will.
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
public class ComingController : Controller
{
    [HttpGet("/logs"), FeatureGate(Features.LogsExplorer)]
    public IActionResult Logs() => Coming("Log Explorer", "G-3");

    [HttpGet("/trace"), FeatureGate(Features.LogsTrace)]
    public IActionResult Trace() => Coming("Trace", "G-3");

    [HttpGet("/usage"), FeatureGate(Features.LogsUsage)]
    public IActionResult Usage() => Coming("Usage", "G-3");

    [HttpGet("/admin/membership"), FeatureGate(Features.AdminMembership)]
    public IActionResult Membership() => Coming("Membership", "G-2");

    private IActionResult Coming(string page, string slice)
    {
        ViewData["Title"] = page;
        ViewData["Slice"] = slice;
        return View("Coming");
    }
}
