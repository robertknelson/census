using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.Identity;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace Census.Web.Controllers.Api;

// Usage's API (usage.md §4). One application, a stage (absent: every stage), a window the browser
// sends for its own period, at most a quarter and a few days. No gate (R5).
[ApiController]
[Route("api/usage")]
[RequireFeature("view.usage")]
public class UsageController(UsageReader usage, MoveItScope owners) : ControllerBase
{
    // Setting: the longest window one request reads (a quarter, with room for the browser's offset).
    public static readonly TimeSpan Longest = TimeSpan.FromDays(95);

    private static readonly string[] Sections = ["overview", "pages", "page", "people", "paths", "friction", "when"];

    [HttpGet("applications")]
    public async Task<IActionResult> Applications(string from, string to)
    {
        if (!usage.Enabled) return NotFound(new { message = "No log database is configured." });
        if (!TryWindow(from, to, out var start, out var end, out var problem)) return BadRequest(new { message = problem });
        try
        {
            // Only the applications the member sees (usage.md U-R1); everyone's for a system administrator.
            var reader = await owners.ForAsync(User);
            var kept = new List<Dictionary<string, object>>();
            foreach (var row in await usage.ApplicationsAsync(start, end))
            {
                if (await reader.SeesLogApplicationAsync(row["application"] as string)) kept.Add(row);
            }
            return Ok(kept);
        }
        catch (SqlException e) when (e.Number == 50404)
        {
            return NotFound(new { message = e.Message });
        }
    }

    // Every application's figures for the persona UX's period view (usage.md U5); a stage, PROD unless asked.
    [HttpGet("summary")]
    public async Task<IActionResult> Summary(string from, string to, string stage = "PROD")
    {
        if (!usage.Enabled) return NotFound(new { message = "No log database is configured." });
        if (!TryWindow(from, to, out var start, out var end, out var problem)) return BadRequest(new { message = problem });
        try
        {
            var json = await usage.SummaryAsync(string.IsNullOrWhiteSpace(stage) ? null : stage.Trim(), start, end);
            var reader = await owners.ForAsync(User);
            if (reader.All) return Content(json, "application/json");
            var kept = new System.Text.Json.Nodes.JsonArray();
            foreach (var item in (System.Text.Json.Nodes.JsonNode.Parse(json) as System.Text.Json.Nodes.JsonArray ?? []).ToList())
            {
                if (await reader.SeesLogApplicationAsync(item?["application"]?.GetValue<string>())) kept.Add(item?.DeepClone());
            }
            return Content(kept.ToJsonString(), "application/json");
        }
        catch (SqlException e) when (e.Number == 50404)
        {
            return NotFound(new { message = e.Message });
        }
    }

    [HttpGet("{section}")]
    public async Task<IActionResult> Section(string section, string application, string stage, string from, string to, int offset = 0, string page = null)
    {
        if (!usage.Enabled) return NotFound(new { message = "No log database is configured." });
        if (Array.IndexOf(Sections, section) < 0) return NotFound(new { message = $"Unknown section '{section}'." });
        if (string.IsNullOrWhiteSpace(application)) return BadRequest(new { message = "Choose an application." });
        if (!await (await owners.ForAsync(User)).SeesLogApplicationAsync(application)) return StatusCode(403, new { message = "That application is not one of yours." });
        if (section == "page" && string.IsNullOrWhiteSpace(page)) return BadRequest(new { message = "Choose a page." });
        if (!TryWindow(from, to, out var start, out var end, out var problem)) return BadRequest(new { message = problem });
        var scope = new UsageScope(application.Trim(), string.IsNullOrWhiteSpace(stage) ? null : stage.Trim(), start, end, Math.Clamp(offset, -840, 840));
        try
        {
            return Content(await usage.SectionAsync(section, scope, page?.Trim()), "application/json");
        }
        catch (SqlException e) when (e.Number == 50404)
        {
            return NotFound(new { message = e.Message });
        }
    }

    private static bool TryWindow(string from, string to, out DateTimeOffset start, out DateTimeOffset end, out string problem)
    {
        end = default;
        problem = null;
        if (!DateTimeOffset.TryParse(from, CultureInfo.InvariantCulture, DateTimeStyles.None, out start)
            || !DateTimeOffset.TryParse(to, CultureInfo.InvariantCulture, DateTimeStyles.None, out end) || end <= start)
            problem = "The window must be two moments, the second after the first.";
        else if (end - start > Longest)
            problem = "Usage reads at most a quarter at a time.";
        return problem == null;
    }
}
