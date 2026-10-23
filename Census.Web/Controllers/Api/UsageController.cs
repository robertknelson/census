using System;
using System.Globalization;
using System.Threading.Tasks;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace Census.Web.Controllers.Api;

// Usage's API (usage.md §4). One application, a stage (absent: every stage), a window the browser
// sends for its own period, at most a quarter and a few days. No gate (R5).
[ApiController]
[Route("api/usage")]
public class UsageController(UsageReader usage) : ControllerBase
{
    // Setting: the longest window one request reads (a quarter, with room for the browser's offset).
    public static readonly TimeSpan Longest = TimeSpan.FromDays(95);

    private static readonly string[] Sections = ["overview", "pages", "page", "people"];

    [HttpGet("applications")]
    public async Task<IActionResult> Applications(string from, string to)
    {
        if (!usage.Enabled) return NotFound(new { message = "No log database is configured." });
        if (!TryWindow(from, to, out var start, out var end, out var problem)) return BadRequest(new { message = problem });
        try
        {
            return Ok(await usage.ApplicationsAsync(start, end));
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
