using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Census.Web.Models;

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

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}
