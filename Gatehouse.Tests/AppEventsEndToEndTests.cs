using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Gatehouse.Membership;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Gatehouse.Tests;

// AppEvent's pages and Log Explorer's AppEvent model (gatehouse.md §12.6, A-3) and Gatehouse's own events through
// ILogger (A-2), both halves, against the demo events in CensusLogsDemo (setup\Invoke-GatehouseDemo.ps1). Test visitors
// and their events are gt-*, removed before and after.
// One collection with the other visitor tests: their clean-ups remove every gt-visitor-* row.
[Collection("visitors")]
public class AppEventsEndToEndTests : IClassFixture<GatingEndToEndTests.App>, IAsyncLifetime
{
    private readonly GatingEndToEndTests.App _app;
    private readonly string _run = Guid.NewGuid().ToString("N")[..6];

    public AppEventsEndToEndTests(GatingEndToEndTests.App app) => _app = app;

    public Task InitializeAsync() => VisitorCleanUp.RunAsync(_app);

    public Task DisposeAsync() => VisitorCleanUp.RunAsync(_app);

    private static string Week => $"from={Uri.EscapeDataString(DateTimeOffset.Now.AddDays(-8).ToString("o"))}&to={Uri.EscapeDataString(DateTimeOffset.Now.AddMinutes(1).ToString("o"))}";

    [Fact]
    public async Task Only_its_feature_opens_the_units_of_work_and_the_explorers_appevent_model()
    {
        var lead = _app.As($"gt-ae-lead-{_run}", "technical-lead");
        Assert.Equal(HttpStatusCode.Forbidden, (await lead.GetAsync("/app-events")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await lead.GetAsync($"/api/app-events/works?{Week}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await lead.GetAsync($"/api/logs/app-event/search?log-start=2026-10-01T00:00:00Z&log-end=2026-10-02T00:00:00Z")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await lead.GetAsync($"/api/logs/api-request/search?log-start=2026-10-01T00:00:00Z&log-end=2026-10-02T00:00:00Z")).StatusCode);
        Assert.DoesNotContain("app-event", await lead.GetStringAsync("/logs"));

        var admin = _app.As($"gt-ae-admin-{_run}", "system-administrator");
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/app-events")).StatusCode);
        Assert.Contains("\"app-event\"", await admin.GetStringAsync("/logs"));
        Assert.Contains(">App events</a>", await admin.GetStringAsync("/"));
    }

    [Fact]
    public async Task The_demo_week_shows_completed_failed_and_stuck_work_and_agrees_with_the_explorer()
    {
        var admin = _app.As($"gt-ae-admin2-{_run}", "system-administrator");
        var works = await admin.GetFromJsonAsync<JsonArray>($"/api/app-events/works?{Week}&namespace=underwriting&commandName=quote-request");
        Assert.True(works.Count >= 50, "The demo events are missing (setup\\Invoke-GatehouseDemo.ps1).");
        var statuses = works.Select(w => (string)w["status"]).ToHashSet();
        Assert.Contains("completed", statuses);
        Assert.Contains("failed", statuses);
        Assert.Contains("stuck", statuses);
        Assert.All(works, w => Assert.True((bool)w["registered"]));

        var search = await admin.GetFromJsonAsync<JsonObject>(
            $"/api/logs/app-event/search?log-start={Uri.EscapeDataString(DateTimeOffset.Now.AddDays(-8).ToString("o"))}&log-end={Uri.EscapeDataString(DateTimeOffset.Now.AddMinutes(1).ToString("o"))}&Namespace-in=underwriting&pageSize=1");
        Assert.Equal(works.Sum(w => (int)w["events"]), (int)search["total"]);

        var completed = works.First(w => (string)w["status"] == "completed");
        var work = await admin.GetFromJsonAsync<JsonObject>($"/api/app-events/work/{completed["workUid"]}");
        var events = (JsonArray)work["events"];
        Assert.Equal(10, events.Count);
        Assert.Equal("created,handed-off,received,started,handed-off,received,started,completed,completed,completed",
            string.Join(",", events.Select(e => (string)e["activity"])));
        Assert.Equal("WidgetPortal,LedgerService,PolicyMaster", string.Join(",", events.Select(e => (string)e["application"]).Distinct()));
        Assert.Contains("\"policy\"", (string)events[0]["body"]);

        var stuck = await admin.GetFromJsonAsync<JsonArray>($"/api/app-events/works?{Week}&status=stuck");
        Assert.All(stuck, w => Assert.Equal("handed-off", (string)w["lastActivity"]));
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/app-events/work/00000000-0000-0000-0000-000000000000")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync($"/api/app-events/works?{Week}&status=nope")).StatusCode);
    }

    [Fact]
    public async Task A_request_to_join_logged_through_ilogger_reads_back_as_one_unit_of_work()
    {
        var visitor = _app.AsVisitor($"gt-visitor-ae-{_run}");
        var welcome = await visitor.GetFromJsonAsync<JsonObject>("/api/welcome");
        var asked = await visitor.PostAsJsonAsync("/api/welcome/request", new
        {
            firstName = "Ada", lastName = "Event", email = "ada@example.com", reason = "Testing the unit of work.",
            roleId = (int)welcome["roles"][0]["id"], applicationIds = new[] { (int)welcome["applications"][0]["id"] },
        });
        Assert.Equal(HttpStatusCode.OK, asked.StatusCode);
        var id = (int)JsonNode.Parse(await asked.Content.ReadAsStringAsync())["key"];

        var admin = _app.As($"gt-ae-admin3-{_run}", "system-administrator");
        var declined = await admin.PostAsJsonAsync($"/api/membership/requests/{id}/decline", new { note = "Not this time." });
        Assert.Equal(HttpStatusCode.OK, declined.StatusCode);

        // The events are written behind the request, on the writer's queue.
        JsonArray events = null;
        for (var i = 0; i < 50 && (events?.Count ?? 0) < 2; i++)
        {
            await Task.Delay(100);
            var work = await admin.GetAsync($"/api/app-events/work/{AccessRequest.WorkUid(id)}");
            if (work.IsSuccessStatusCode) events = (JsonArray)JsonNode.Parse(await work.Content.ReadAsStringAsync())["events"];
        }
        Assert.NotNull(events);
        Assert.Equal("created,failed", string.Join(",", events.Select(e => (string)e["activity"])));
        Assert.Equal(($"gt-visitor-ae-{_run}", $"gt-ae-admin3-{_run}"), ((string)events[0]["identifier"], (string)events[1]["identifier"]));
        Assert.Equal((string)events[0]["uid"], (string)events[1]["parentUid"]);
        Assert.Equal(("access-request", id.ToString()), ((string)events[1]["subjectType"], (string)events[1]["subjectKey"]));
        Assert.Equal("Declined the request to join: Not this time.", (string)events[1]["message"]);
        Assert.Equal(("Gatehouse", "LOCAL"), ((string)events[0]["application"], (string)events[0]["stage"]));
    }

}
