using Gatehouse.FeatureManagement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.FeatureManagement.Mvc;

namespace Gatehouse.AppEvents;

// The units of work (gatehouse.md §12.6): the recent ones, and one unit across systems. Behind the same feature as their API.
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
public class AppEventsPageController : Controller
{
    [HttpGet("/app-events"), FeatureGate(Features.LogsAppEvents)]
    public IActionResult Index() => View("~/app-events/views/AppEvents.cshtml");

    [HttpGet("/app-events/work/{workUid}"), FeatureGate(Features.LogsAppEvents)]
    public IActionResult Work(string workUid) => View("~/app-events/views/AppEvents.cshtml");
}

// The catalog of kinds' screen (gatehouse.md §12.3), behind the same feature as its API.
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
public class AppEventKindsPageController : Controller
{
    [HttpGet("/admin/app-event-kinds"), FeatureGate(Features.AdminAppEventKinds)]
    public IActionResult Index() => View("~/app-events/views/AppEventKinds.cshtml");
}
