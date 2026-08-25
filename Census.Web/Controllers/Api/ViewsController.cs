using System.Linq;
using Census.Web.Models.Views;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/views")]
public class ViewsController(ViewsStore viewsStore) : ControllerBase
{
    [HttpGet]
    public ActionResult<ViewsConfig> Get() => Ok(viewsStore.Load());

    // Whole-file replace, the config-editor pattern. A view without an id or a system
    // cannot be opened and is dropped; everything else survives verbatim.
    [HttpPut]
    public IActionResult Put([FromBody] ViewsConfig config)
    {
        if (config is null) return BadRequest(new { errors = new[] { "a config body is required" } });

        var views = (config.Views ?? [])
            .Where(v => v is not null && !string.IsNullOrWhiteSpace(v.Id) && !string.IsNullOrWhiteSpace(v.System))
            .ToList();

        viewsStore.Save(new ViewsConfig { Version = config.Version, Views = views });
        return NoContent();
    }
}
