using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Gatehouse.FeatureManagement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using Microsoft.FeatureManagement.Mvc;

namespace Gatehouse.Logs;

// Log Explorer, Trace and Usage (gatehouse.md §7): Census's pages, each behind its feature. Each is told which of the
// other two the reader may open, so its cross-links never lead to a 403.
[Authorize(Policy = FeatureAccessPolicies.SignedIn)]
public class LogsPageController(IFeatureManager features, IOptions<LogsOptions> logs, IOptions<UsageOptions> usage, UsageAccess access) : Controller
{
    [HttpGet("/logs"), FeatureGate(Features.LogsExplorer)]
    public async Task<IActionResult> Logs()
    {
        var models = new List<string> { "api-request", "exception-event", "message" };
        if (await features.IsEnabledAsync(Features.LogsAppEvents)) models.Add("app-event");
        ViewData["Config"] = new { root = "#log-explorer", models };
        return View("~/logs/views/Logs.cshtml");
    }

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
            // Gatehouse (§13): the reader's applications (null, every one), and who is left out of the figures.
            only = (await access.ScopeAsync(User))?.Select(h => new { name = h.Name, identifier = h.Identifier }),
            excluded = access.Excluded,
        };
        return View("~/logs/views/Usage.cshtml");
    }

    [HttpGet("/usage/summary"), FeatureGate(Features.LogsUsageSummary)]
    public IActionResult Summary()
    {
        ViewData["Config"] = new { fiscalStart = usage.Value.FiscalYearStartMonth, excluded = access.Excluded };
        return View("~/logs/views/UsageSummary.cshtml");
    }
}
