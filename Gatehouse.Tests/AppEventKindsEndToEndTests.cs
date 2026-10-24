using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Gatehouse.Tests;

// The catalog of kinds (gatehouse.md §12.3, A-1), both halves, against the local AppTrak and the demo events in
// CensusLogsDemo (setup\Invoke-GatehouseDemo.ps1): the registered kinds beside the ones the events name but nobody
// registered, the NOUN-VERB form checked with every reason, register, correct, retire, the history. Test kinds are
// gt-test-*, removed before and after by sql\cleanup-test-kinds.sql.
public class AppEventKindsEndToEndTests : IClassFixture<GatingEndToEndTests.App>, IAsyncLifetime
{
    private readonly GatingEndToEndTests.App _app;

    public AppEventKindsEndToEndTests(GatingEndToEndTests.App app) => _app = app;

    public Task InitializeAsync() => CleanUp();

    public Task DisposeAsync() => CleanUp();

    [Fact]
    public async Task Only_its_feature_opens_the_screen_and_its_api()
    {
        var lead = _app.As("gt-kinds-lead", "technical-lead");
        Assert.Equal(HttpStatusCode.Forbidden, (await lead.GetAsync("/admin/app-event-kinds")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await lead.GetAsync("/api/app-event-kinds")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await lead.PostAsJsonAsync("/api/app-event-kinds", new { })).StatusCode);
        var admin = _app.As("gt-kinds-admin0", "system-administrator");
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/admin/app-event-kinds")).StatusCode);
        Assert.Contains(">Event kinds</a>", await admin.GetStringAsync("/"));
        Assert.DoesNotContain(">Event kinds</a>", await lead.GetStringAsync("/"));
    }

    [Fact]
    public async Task A_kind_the_events_name_but_nobody_registered_is_offered_for_registration()
    {
        var catalog = await _app.As("gt-kinds-admin1", "system-administrator").GetFromJsonAsync<JsonObject>("/api/app-event-kinds");
        var unregistered = (JsonArray)catalog["unregistered"];
        var invoice = unregistered.SingleOrDefault(u => (string)u["namespace"] == "billing" && (string)u["commandName"] == "invoice-send");
        Assert.True(invoice != null, "The demo events are missing (setup\\Invoke-GatehouseDemo.ps1).");
        Assert.Equal("LedgerService", (string)invoice["applications"]);
        var quote = ((JsonArray)catalog["kinds"]).Single(k => (string)k["namespace"] == "underwriting" && (string)k["commandName"] == "quote-request");
        Assert.True((int)quote["recent"] > 0);
        Assert.DoesNotContain(unregistered, u => (string)u["commandName"] == "quote-request");
    }

    [Fact]
    public async Task A_kind_is_registered_corrected_and_retired_with_every_reason_and_its_history()
    {
        var admin = _app.As("gt-kinds-admin2", "system-administrator");
        var bad = await Post(admin, "/api/app-event-kinds", new { @namespace = "Under Writing", commandName = "quote", displayName = "" });
        Assert.Equal(HttpStatusCode.BadRequest, bad.Status);
        var reasons = string.Join(" ", ((JsonArray)bad.Body["errors"]).Select(e => (string)e));
        Assert.Contains("kebab-case", reasons);
        Assert.Contains("NOUN-VERB", reasons);
        Assert.Contains("Display name", reasons);

        var created = await Post(admin, "/api/app-event-kinds", new { @namespace = "gt-test", commandName = "widget-check", displayName = "Widget check" });
        Assert.Equal(HttpStatusCode.OK, created.Status);
        var id = (int)created.Body["key"];
        Assert.Equal(HttpStatusCode.Conflict, (await Post(admin, "/api/app-event-kinds", new { @namespace = "gt-test", commandName = "widget-check", displayName = "Twin" })).Status);
        Assert.Equal(HttpStatusCode.OK, (await Post(admin, $"/api/app-event-kinds/{id}", new { @namespace = "gt-test", commandName = "widget-check", displayName = "Widget checked", disposition = "current" })).Status);
        Assert.Equal(HttpStatusCode.OK, (await Post(admin, $"/api/app-event-kinds/{id}", new { @namespace = "gt-test", commandName = "widget-check", displayName = "Widget checked", disposition = "retired" })).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await Post(admin, "/api/app-event-kinds/999999", new { @namespace = "gt-test", commandName = "widget-gone", displayName = "Gone" })).Status);

        var kind = ((JsonArray)(await admin.GetFromJsonAsync<JsonObject>("/api/app-event-kinds"))["kinds"]).Single(k => (int)k["appEventKindId"] == id);
        Assert.Equal(("retired", "Widget checked"), ((string)kind["disposition"], (string)kind["displayName"]));
        var history = await admin.GetFromJsonAsync<JsonArray>($"/api/app-event-kinds/{id}/audit");
        Assert.Equal("retired,updated,created", string.Join(",", history.Select(e => (string)e["action"])));
        Assert.All(history, e => Assert.Equal("gt-kinds-admin2", (string)e["changedBy"]));
    }

    private async Task CleanUp()
    {
        var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "sql", "cleanup-test-kinds.sql"));
        await using var connection = new SqlConnection(_app.Services.GetRequiredService<IConfiguration>().GetConnectionString("default"));
        await connection.OpenAsync();
        await using var command = new SqlCommand(script, connection);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<(HttpStatusCode Status, JsonNode Body)> Post(HttpClient client, string path, object body)
    {
        var response = await client.PostAsJsonAsync(path, body);
        var text = await response.Content.ReadAsStringAsync();
        return (response.StatusCode, string.IsNullOrEmpty(text) ? null : JsonNode.Parse(text));
    }
}
