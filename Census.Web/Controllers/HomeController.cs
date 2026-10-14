using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Census.Web.Models;
using Census.Web.Services;

namespace Census.Web.Controllers;

public class HomeController : Controller
{
    private readonly ILogger<HomeController> _logger;

    public HomeController(ILogger<HomeController> logger)
    {
        _logger = logger;
    }

    [HttpGet("/classic")]
    public IActionResult Index()
    {
        return View();
    }

    [HttpGet("/")]
    [HttpGet("/estate")]
    public IActionResult Estate()
    {
        return View();
    }

    // The Atlas module (system-view.md §1): its own page and JS tree, apart from the
    // Estate SPA — same stores underneath, so the truth never forks.
    [HttpGet("/atlas")]
    public IActionResult Atlas()
    {
        return View();
    }

    // The day (day-view.md §8): what changed on a day, or across a range, for every machine —
    // the headline, the events, the month grid. Its own page and JS tree, like Atlas.
    [HttpGet("/day")]
    public IActionResult Day()
    {
        return View();
    }

    // The board (move-it.md §13): the governance reader's page, read-only over AppTrak. Not
    // mounted without a connection string — the rest of Census stays file-only.
    [HttpGet("/moveit")]
    public IActionResult MoveIt([FromServices] MoveItQuestions questions)
    {
        if (!questions.Enabled) return NotFound();
        return View();
    }

    // Division (move-it.md §19): the executive's page — every project and feature on a step
    // line from the developers to live. Read-only.
    [HttpGet("/moveit/division")]
    public IActionResult MoveItDivision([FromServices] MoveItQuestions questions)
    {
        if (!questions.Enabled) return NotFound();
        return View();
    }

    // History (move-it.md §15): the ledger newest first, and the one page where anything is
    // entered. The board above stays read-only.
    [HttpGet("/moveit/history")]
    public IActionResult MoveItHistory([FromServices] MoveItQuestions questions)
    {
        if (!questions.Enabled) return NotFound();
        return View();
    }

    // The week (move-it.md §25): seven days of change on one printable page. Read-only.
    [HttpGet("/moveit/week")]
    public IActionResult MoveItWeek([FromServices] MoveItQuestions questions)
    {
        if (!questions.Enabled) return NotFound();
        return View();
    }

    // Calendar (move-it.md §21): when builds reached each stage, what people recorded, and
    // when releases were due, on a month grid. Read-only.
    [HttpGet("/moveit/calendar")]
    public IActionResult MoveItCalendar([FromServices] MoveItQuestions questions)
    {
        if (!questions.Enabled) return NotFound();
        return View();
    }

    // The registers (move-it.md §28): every feature and fix, and every release, as flat lists
    // with find, facets, sort and paging. Read-only.
    [HttpGet("/moveit/features")]
    public IActionResult MoveItFeatures([FromServices] MoveItQuestions questions)
    {
        if (!questions.Enabled) return NotFound();
        return View();
    }

    [HttpGet("/moveit/releases")]
    public IActionResult MoveItReleases([FromServices] MoveItQuestions questions)
    {
        if (!questions.Enabled) return NotFound();
        return View();
    }

    // The release page (move-it.md §16): one release in depth, with its events and edits.
    [HttpGet("/moveit/release/{id:int}")]
    public IActionResult MoveItRelease(int id, [FromServices] MoveItQuestions questions)
    {
        if (!questions.Enabled) return NotFound();
        ViewData["ReleaseId"] = id;
        return View();
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}
