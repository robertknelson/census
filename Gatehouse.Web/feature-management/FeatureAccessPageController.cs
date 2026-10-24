using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Gatehouse.FeatureManagement;

// FM2280's admin page, behind the fixed admin policy, never a feature (gatehouse.md §6), as its API is.
[Authorize(Policy = FeatureAccessPolicies.Admin)]
public class FeatureAccessPageController : Controller
{
    [HttpGet("/admin/feature-access")]
    public IActionResult Index() => View("~/feature-management/views/FeatureAccess.cshtml");
}
