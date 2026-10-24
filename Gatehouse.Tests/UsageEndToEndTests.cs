using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Gatehouse.Tests;

// Usage completed (gatehouse.md §13), both halves, against CensusLogsDemo and the local AppTrak: a member sees only the
// applications they hold a role on (U-R1), the summary for executives and system administrators (U-R2), the visits that
// came from another application (U-R5). The exclusions (U-R3) run on a host of their own with bkim left out of WidgetCore.
// The test member is gt-usage-*, made and removed through the Membership API.
public class UsageEndToEndTests : IClassFixture<GatingEndToEndTests.App>, IClassFixture<UsageEndToEndTests.ExcludingApp>, IAsyncLifetime
{
    private const string October = "from=2026-10-01T00:00:00-04:00&to=2026-10-24T00:00:00-04:00";

    private readonly GatingEndToEndTests.App _app;
    private readonly ExcludingApp _excluding;

    public UsageEndToEndTests(GatingEndToEndTests.App app, ExcludingApp excluding)
    {
        _app = app;
        _excluding = excluding;
    }

    public Task InitializeAsync() => RemoveTestMember();

    public Task DisposeAsync() => RemoveTestMember();

    [Fact]
    public async Task A_member_sees_only_the_applications_they_hold_a_role_on()
    {
        await MakeTestMember("widgetcore", "my-webapp");
        var owner = _app.As("gt-usage-owner", "product-owner");
        var applications = await owner.GetFromJsonAsync<JsonArray>($"/api/usage/applications?{October}");
        Assert.True(applications.Count > 0, "CensusLogsDemo has no October rows (apptrak\\Invoke-LogsDemo.ps1).");
        Assert.All(applications, a => Assert.Equal("WidgetCore", (string)a["application"]));
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/usage/overview?application=WidgetCore&{October}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync($"/api/usage/overview?application=WidgetPortal&{October}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync($"/api/usage/pages?application=LedgerService&{October}")).StatusCode);
        var page = await owner.GetStringAsync("/usage");
        Assert.Contains("\"name\":\"WidgetCore\"", page);
        Assert.Contains("\"name\":\"My WebApp\"", page);

        var admin = _app.As("gt-usage-admin", "system-administrator");
        var all = await admin.GetFromJsonAsync<JsonArray>($"/api/usage/applications?{October}");
        Assert.True(all.Select(a => (string)a["application"]).Distinct().Count() > 1);
        Assert.Contains("\"only\":null", await admin.GetStringAsync("/usage"));
    }

    [Fact]
    public async Task The_summary_is_for_executives_and_administrators_and_links_only_where_usage_opens()
    {
        Assert.Equal(HttpStatusCode.Forbidden, (await _app.As("gt-usage-lead", "technical-lead").GetAsync($"/api/usage-summary?{October}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _app.As("gt-usage-lead2", "technical-lead").GetAsync("/usage/summary")).StatusCode);

        var executive = await _app.As("gt-usage-exec", "executive").GetFromJsonAsync<JsonArray>($"/api/usage-summary?{October}");
        Assert.True(executive.Count > 1);
        Assert.All(executive, r => Assert.False((bool)r["canOpen"]));
        var admin = _app.As("gt-usage-admin2", "system-administrator");
        var rows = await admin.GetFromJsonAsync<JsonArray>($"/api/usage-summary?{October}");
        var page = await admin.GetStringAsync("/usage/summary");
        Assert.Contains("gh-nav-item is-active\" href=\"/usage/summary\"", page);
        Assert.DoesNotContain("gh-nav-item is-active\" href=\"/usage\"", page);
        Assert.All(rows, r => Assert.True((bool)r["canOpen"]));

        // The summary's figures are the application's own: WidgetCore's people and sessions as its Usage overview counts them.
        var core = rows.Single(r => (string)r["application"] == "WidgetCore");
        var overview = await admin.GetFromJsonAsync<JsonObject>($"/api/usage/overview?application=WidgetCore&stage=PROD&{October}");
        Assert.Equal((int)overview["people"], (int)core["people"]);
        Assert.Equal((int)overview["sessions"], (int)core["sessions"]);
    }

    [Fact]
    public async Task Visits_from_another_application_are_named_by_its_observed_host()
    {
        var admin = _app.As("gt-usage-admin3", "system-administrator");
        var arrivals = await admin.GetFromJsonAsync<JsonArray>("/api/usage/arrivals?application=WidgetCore&from=2026-09-01T00:00:00-04:00&to=2026-10-25T00:00:00-04:00");
        Assert.NotEmpty(arrivals);
        Assert.All(arrivals, a => Assert.Equal("WidgetPortal", (string)a["from"]));
        Assert.Equal(21, arrivals.Sum(a => (int)a["sessions"]));
    }

    [Fact]
    public async Task An_excluded_identifier_is_left_out_of_every_figure_and_named_on_the_page()
    {
        var plain = _app.As("gt-usage-admin4", "system-administrator");
        var excluding = _excluding.As("gt-usage-admin5", "system-administrator");
        var before = await plain.GetFromJsonAsync<JsonObject>($"/api/usage/overview?application=WidgetCore&stage=PROD&{October}");
        var after = await excluding.GetFromJsonAsync<JsonObject>($"/api/usage/overview?application=WidgetCore&stage=PROD&{October}");
        Assert.Equal((int)before["people"] - 1, (int)after["people"]);
        Assert.True((int)after["sessions"] < (int)before["sessions"]);
        var people = await excluding.GetFromJsonAsync<JsonArray>($"/api/usage/people?application=WidgetCore&stage=PROD&{October}");
        Assert.DoesNotContain(people, p => (string)p["identifier"] == "bkim");
        Assert.Contains(await plain.GetFromJsonAsync<JsonArray>($"/api/usage/people?application=WidgetCore&stage=PROD&{October}"), p => (string)p["identifier"] == "bkim");
        var summary = (await excluding.GetFromJsonAsync<JsonArray>($"/api/usage-summary?{October}")).Single(r => (string)r["application"] == "WidgetCore");
        Assert.Equal((int)after["people"], (int)summary["people"]);
        // Another application keeps its figures.
        Assert.Equal(
            (int)(await plain.GetFromJsonAsync<JsonObject>($"/api/usage/overview?application=WidgetPortal&stage=PROD&{October}"))["people"],
            (int)(await excluding.GetFromJsonAsync<JsonObject>($"/api/usage/overview?application=WidgetPortal&stage=PROD&{October}"))["people"]);
        Assert.Contains("\"WidgetCore\":[\"bkim\"]", await excluding.GetStringAsync("/usage"));
    }

    // The same host, with bkim left out of WidgetCore's figures (Usage:Excluded).
    public class ExcludingApp : GatingEndToEndTests.App
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string> { ["Usage:Excluded:WidgetCore:0"] = "bkim" }));
        }
    }

    private async Task MakeTestMember(params string[] applications)
    {
        var admin = _app.As("gt-usage-maker", "system-administrator");
        var lists = await admin.GetFromJsonAsync<JsonArray>("/api/membership/lists");
        var role = (int)lists.Single(l => (string)l["list"] == "member-types" && (string)l["identifier"] == "product-owner")["id"];
        var registry = await admin.GetFromJsonAsync<JsonArray>("/api/membership/applications");
        var made = await admin.PostAsJsonAsync("/api/membership/members", new { identifier = "gt-usage-owner", windowsIdentity = @"TEST\gt-usage-owner", firstName = "Usage", lastName = "Owner", email = "" });
        var memberId = (int)JsonNode.Parse(await made.Content.ReadAsStringAsync())["key"];
        foreach (var identifier in applications)
        {
            var applicationId = (int)registry.Single(a => (string)a["identifier"] == identifier)["applicationId"];
            await admin.PostAsJsonAsync("/api/membership/grants/grant", new { memberId, applicationId, roleId = role });
        }
    }

    private async Task RemoveTestMember()
    {
        var admin = _app.As("gt-usage-remover", "system-administrator");
        foreach (var m in (await admin.GetFromJsonAsync<JsonArray>("/api/membership/members")).Where(m => (string)m["identifier"] == "gt-usage-owner").Select(m => (int)m["memberId"]).Distinct().ToList())
            await admin.PostAsJsonAsync($"/api/membership/members/{m}/delete", new { });
    }
}
