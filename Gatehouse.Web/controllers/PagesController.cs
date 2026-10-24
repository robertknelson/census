using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Gatehouse.FeatureManagement;
using Gatehouse.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
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
        // Not a member: the welcome is their page (gatehouse.md §11.1).
        if (User.HasClaim(ClaimsTransformer.MemberClaim, "false")) return Redirect("/welcome");
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

// Census's membership page (gatehouse.md §7), behind the same feature as its API. It is told which application is this
// one, so its landing page can say when nobody may administer it.
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
public class MembershipPageController(IOptions<IdentityOptions> identity) : Controller
{
    [HttpGet("/admin/membership"), FeatureGate(Features.AdminMembership)]
    public IActionResult Index()
    {
        ViewData["Application"] = identity.Value.Application;
        return View("~/membership/views/Membership.cshtml");
    }
}

// The visitor welcome (gatehouse.md §11): a signed-in non-member asks to join. The fixed Visitor policy, never a
// feature, so a newcomer always has a way in; a member is refused it.
[Authorize(Policy = FeatureAccessPolicies.Visitor)]
public class WelcomePageController : Controller
{
    [HttpGet("/welcome")]
    public IActionResult Index() => View("~/membership/views/Welcome.cshtml");
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

    private IActionResult Coming(string page, string slice)
    {
        ViewData["Title"] = page;
        ViewData["Slice"] = slice;
        return View("Coming");
    }
}
