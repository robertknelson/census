using Gatehouse.FeatureManagement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.FeatureManagement.Mvc;

namespace Gatehouse.AppEvents;

// The catalog of kinds' screen (gatehouse.md §12.3), behind the same feature as its API.
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
public class AppEventKindsPageController : Controller
{
    [HttpGet("/admin/app-event-kinds"), FeatureGate(Features.AdminAppEventKinds)]
    public IActionResult Index() => View("~/app-events/views/AppEventKinds.cshtml");
}
