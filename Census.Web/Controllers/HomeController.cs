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

    // The board (move-it.md §13): the governance reader's page, read-only over AppTrak. Not
    // mounted without a connection string — the rest of Census stays file-only.
    [HttpGet("/moveit")]
    public IActionResult MoveIt([FromServices] MoveItQuestions questions)
    {
        if (!questions.Enabled) return NotFound();
        return View();
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}
