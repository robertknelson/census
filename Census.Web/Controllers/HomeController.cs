using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
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

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}
