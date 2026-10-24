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
