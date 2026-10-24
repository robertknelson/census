using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Gatehouse.FeatureManagement;
using Gatehouse.Identity;
using Gatehouse.Logs;
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

// Log Explorer, Trace and Usage (gatehouse.md §7): Census's pages, each behind its feature. Each is told which of the
// other two the reader may open, so its cross-links never lead to a 403.
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
public class LogsPageController(IFeatureManager features, IOptions<LogsOptions> logs, IOptions<UsageOptions> usage) : Controller
{
    [HttpGet("/logs"), FeatureGate(Features.LogsExplorer)]
    public IActionResult Logs() => View("~/logs/views/Logs.cshtml");

    [HttpGet("/trace"), FeatureGate(Features.LogsTrace)]
    public async Task<IActionResult> Trace()
    {
        ViewData["Config"] = new { links = new { logs = await features.IsEnabledAsync(Features.LogsExplorer), usage = await features.IsEnabledAsync(Features.LogsUsage) } };
        return View("~/logs/views/Trace.cshtml");
    }

    [HttpGet("/usage"), FeatureGate(Features.LogsUsage)]
    public async Task<IActionResult> Usage()
    {
        var f = usage.Value.Friction;
        ViewData["Config"] = new
        {
            api = "/api/usage",
            fiscalStart = usage.Value.FiscalYearStartMonth,
            slowMs = logs.Value.SlowMs,
            friction = new { endedWithinMinutes = f.EndedWithinMinutes, refusedTimes = f.RefusedTimes, loopLoads = f.LoopLoads, loopSeconds = f.LoopSeconds, retrySeconds = f.RetrySeconds },
            links = new { trace = await features.IsEnabledAsync(Features.LogsTrace) },
        };
        return View("~/logs/views/Usage.cshtml");
    }
}
