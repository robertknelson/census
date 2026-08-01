using Census.Web.Models.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

[ApiController]
[Route("api/findings")]
public class FindingsController(FindingsEngine findingsEngine) : ControllerBase
{
    [HttpGet]
    public ActionResult<FindingsResultDto> GetFindings() => Ok(findingsEngine.Compute());
}
