using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Xunit;

namespace Gatehouse.Tests;

// Log Explorer, Trace and Usage (gatehouse.md §7, G-3), both halves: each page and its API behind its own feature, and
// each page told which of the other two its reader may open, so a cross-link never leads to a 403. Against Census's
// CensusLogsDemo (apptrak\Invoke-LogsDemo.ps1) and the features GatehouseDemo grants: a devops lead has the explorer and
// Trace but not Usage; an observer has none of them.
public class LogsEndToEndTests : IClassFixture<GatingEndToEndTests.App>
{
    private const string Window = "from=2026-10-01T00:00:00-04:00&to=2026-10-24T00:00:00-04:00";

    private readonly GatingEndToEndTests.App _app;

    public LogsEndToEndTests(GatingEndToEndTests.App app) => _app = app;

    [Fact]
    public async Task Each_page_and_its_api_carry_their_own_feature()
    {
        var devops = _app.As("gt-logs-devops", "devops-lead");
        Assert.Equal(HttpStatusCode.OK, (await devops.GetAsync("/logs")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await devops.GetAsync("/trace")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await devops.GetAsync($"/api/trace/people?{Window}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await devops.GetAsync("/usage")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await devops.GetAsync($"/api/usage/applications?{Window}")).StatusCode);

        var observer = _app.As("gt-logs-observer", "observer");
        Assert.Equal(HttpStatusCode.Forbidden, (await observer.GetAsync($"/api/logs/api-request/search?log-start=2026-10-01T00:00:00Z&log-end=2026-10-02T00:00:00Z")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await observer.GetAsync($"/api/trace/people?{Window}")).StatusCode);
    }

    [Fact]
    public async Task A_page_links_only_to_the_pages_its_reader_may_open()
    {
        var devops = await _app.As("gt-logs-devops2", "devops-lead").GetStringAsync("/trace");
        Assert.Contains("\"links\":{\"logs\":true,\"usage\":false}", devops);
        var lead = await _app.As("gt-logs-lead", "technical-lead").GetStringAsync("/trace");
        Assert.Contains("\"links\":{\"logs\":true,\"usage\":true}", lead);
        Assert.Contains("\"links\":{\"trace\":true}", await _app.As("gt-logs-lead2", "technical-lead").GetStringAsync("/usage"));
        var owner = await _app.As("gt-logs-owner", "application-owner").GetStringAsync("/usage");
        Assert.Contains("\"links\":{\"trace\":false}", owner);
    }

    [Fact]
    public async Task The_reads_answer_in_census_shapes()
    {
        var lead = _app.As("gt-logs-lead3", "technical-lead");
        var search = await lead.GetFromJsonAsync<JsonObject>("/api/logs/api-request/search?log-start=2026-10-01T00:00:00-04:00&log-end=2026-10-24T00:00:00-04:00&pageSize=5");
        Assert.True((int)search["total"] > 0, "CensusLogsDemo has no rows in October (apptrak\\Invoke-LogsDemo.ps1).");
        Assert.Equal(5, ((JsonArray)search["items"]).Count);
        Assert.Null(search["items"][0]["total"]);
        Assert.NotNull(search["items"][0]["startAt"]);
        var facets = await lead.GetFromJsonAsync<JsonArray>("/api/logs/api-request/facets?start=2026-10-01T00:00:00-04:00&end=2026-10-24T00:00:00-04:00&profile-fields=Application");
        Assert.Equal("application", (string)facets[0]["name"]);
        var overview = await lead.GetFromJsonAsync<JsonObject>($"/api/usage/overview?application=WidgetCore&stage=PROD&{Window}");
        Assert.NotNull(overview);
        Assert.Equal(HttpStatusCode.BadRequest, (await lead.GetAsync("/api/usage/overview?application=WidgetCore&from=2026-01-01T00:00:00Z&to=2026-10-01T00:00:00Z")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await lead.GetAsync($"/api/logs/nope/search?log-start=2026-10-01T00:00:00Z&log-end=2026-10-02T00:00:00Z")).StatusCode);
    }
}
