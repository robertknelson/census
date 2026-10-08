using System.Linq;
using Census.Web.Models;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/stage-crossings")]
public class StageCrossingsController(StageCrossingsStore stageCrossingsStore) : ControllerBase
{
    [HttpGet]
    public ActionResult<StageCrossingsConfig> Get() => Ok(stageCrossingsStore.Load());

    // Whole-file replace, the config-editor pattern (stage-crossings.md §4). An acceptance
    // without both ends names nothing and is dropped; everything else survives as written.
    [HttpPut]
    public IActionResult Put([FromBody] StageCrossingsConfig config)
    {
        if (config is null) return BadRequest(new { errors = new[] { "a config body is required" } });
        stageCrossingsStore.Save(config with
        {
            Accepted = (config.Accepted ?? [])
                .Where(a => a is not null && !string.IsNullOrWhiteSpace(a.Caller) && !string.IsNullOrWhiteSpace(a.Target))
                .Select(a => a with
                {
                    By = string.IsNullOrWhiteSpace(a.By) ? null : a.By.Trim(),
                    At = string.IsNullOrWhiteSpace(a.At) ? null : a.At.Trim(),
                    Note = string.IsNullOrWhiteSpace(a.Note) ? null : a.Note.Trim(),
                })
                .ToList(),
        });
        return NoContent();
    }
}
