using Gatehouse.FeatureManagement;
using Gatehouse.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement.Mvc;

namespace Gatehouse.Membership;

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
