using System;
using System.Globalization;
using System.Threading.Tasks;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace Census.Web.Controllers.Api;

// Trace's API (log-explorer-and-trace.md §5). No gate (R5). Windows are two moments, the second after
// the first, sent by the browser for its own day and month.
[ApiController]
[Route("api/trace")]
public class TraceController(TraceReader trace) : ControllerBase
{
    // Settings: the longest windows one request reads.
    public static readonly TimeSpan LongestDay = TimeSpan.FromDays(2);
    public static readonly TimeSpan LongestMonth = TimeSpan.FromDays(32);

    [HttpGet("people")]
    public Task<IActionResult> People(string from, string to) =>
        Read(from, to, LongestMonth, (start, end) => trace.PeopleAsync(start, end), Ok);

    [HttpGet("day")]
    public Task<IActionResult> Day(string person, string from, string to) =>
        string.IsNullOrWhiteSpace(person)
            ? Task.FromResult<IActionResult>(BadRequest(new { message = "Choose a person." }))
            : Read(from, to, LongestDay, (start, end) => trace.DayAsync(person.Trim(), start, end), Json);

    [HttpGet("month")]
    public Task<IActionResult> Month(string person, string from, string to, int offset = 0) =>
        string.IsNullOrWhiteSpace(person)
            ? Task.FromResult<IActionResult>(BadRequest(new { message = "Choose a person." }))
            : Read(from, to, LongestMonth, (start, end) => trace.MonthAsync(person.Trim(), start, end, Math.Clamp(offset, -840, 840)), Json);

    [HttpGet("session")]
    public async Task<IActionResult> Session(string id)
    {
        if (!trace.Enabled) return NotFound(new { message = "No log database is configured." });
        if (string.IsNullOrWhiteSpace(id)) return BadRequest(new { message = "Choose a session." });
        try
        {
            return Json(await trace.SessionAsync(id.Trim()));
        }
        catch (SqlException e) when (e.Number == 50404)
        {
            return NotFound(new { message = e.Message });
        }
    }

    private async Task<IActionResult> Read<T>(string from, string to, TimeSpan longest, Func<DateTimeOffset, DateTimeOffset, Task<T>> read, Func<T, IActionResult> answer)
    {
        if (!trace.Enabled) return NotFound(new { message = "No log database is configured." });
        if (!TryMoment(from, out var start) || !TryMoment(to, out var end) || end <= start)
            return BadRequest(new { message = "The window must be two moments, the second after the first." });
        if (end - start > longest) return BadRequest(new { message = $"Trace reads at most {longest.TotalDays:0} days at a time." });
        try
        {
            return answer(await read(start, end));
        }
        catch (SqlException e) when (e.Number == 50404)
        {
            return NotFound(new { message = e.Message });
        }
    }

    private ContentResult Json(string json) => Content(json, "application/json");

    private static bool TryMoment(string value, out DateTimeOffset moment) =>
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out moment);
}
