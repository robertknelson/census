using System.Linq;
using Census.Web.Identity;
using Census.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

// Census's config documents and where each lives (census-on-apptrak.md §6), for a system administrator: list them,
// fill one held in the database from its file (Import, audited like any save), or take one out as the JSON file it
// would be (Export: for git, for a diff, for carrying to another AppTrak).
[ApiController]
[Route("api/admin/assertions")]
[Authorize(Policy = CensusClaims.AdministerPolicy)]
public class AssertionsController(AssertionDocuments documents) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        var counts = AssertionDocuments.Documents.Keys.Any(documents.InDatabase)
            ? documents.Counts().ToDictionary(r => (string)r["Document"], r => r)
            : new();
        return Ok(AssertionDocuments.Documents.Keys.Select(name => new
        {
            document = name,
            inDatabase = documents.InDatabase(name),
            rows = counts.TryGetValue(name, out var c) ? (int)c["Rows"] : 0,
            updatedAt = counts.TryGetValue(name, out var u) ? u["UpdatedAt"] : null,
            file = documents.FilePath(name),
        }));
    }

    [HttpPost("{document}/import")]
    public IActionResult Import(string document)
    {
        if (!AssertionDocuments.Documents.ContainsKey(document)) return NotFound();
        if (!documents.InDatabase(document)) return Conflict(new { errors = new[] { $"{document} lives in its file here; there is nothing to import into." } });
        var result = documents.Import(document);
        return result.Status == 200 ? Ok(new { changed = result.Key }) : StatusCode(result.Status, new { errors = new[] { result.Message } });
    }

    [HttpGet("{document}/export")]
    public IActionResult Export(string document)
    {
        if (!AssertionDocuments.Documents.ContainsKey(document)) return NotFound();
        return Content(documents.Read(document) ?? "{}", "application/json");
    }
}
