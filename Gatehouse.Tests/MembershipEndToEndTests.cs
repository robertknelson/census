using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Gatehouse.CommandQuery;
using Gatehouse.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace Gatehouse.Tests;

// Census's tests\Test-Membership.ps1, ported (gatehouse.md §9, G-2): the membership page's writes against the local
// AppTrak, what is refused, the audit each write leaves, and that the identity lookup sees a grant the moment it is
// made. Everything it makes is named gt-test-* and deleted through the API before and after. Never against a real
// server.
public class MembershipEndToEndTests : IClassFixture<GatingEndToEndTests.App>
{
    private readonly GatingEndToEndTests.App _app;

    public MembershipEndToEndTests(GatingEndToEndTests.App app) => _app = app;

    [Fact]
    public async Task Only_a_role_the_feature_is_granted_to_may_use_the_api()
    {
        var lead = _app.As("gt-mb-lead", "technical-lead");
        Assert.Equal(HttpStatusCode.Forbidden, (await lead.GetAsync("/api/membership/members")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await lead.PostAsJsonAsync("/api/membership/grants/grant", new { memberId = 1, applicationId = 1, roleId = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await lead.GetAsync("/admin/membership")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _app.As("gt-mb-admin0", "system-administrator").GetAsync("/admin/membership")).StatusCode);
    }

    [Fact]
    public async Task The_page_writes_refuses_and_remembers()
    {
        var admin = _app.As("gt-mb-admin", "system-administrator");
        await CleanUp(admin);
        try
        {
            var lists = await admin.GetFromJsonAsync<JsonArray>("/api/membership/lists");
            int Pick(string list, string identifier) => (int)lists.Single(l => (string)l["list"] == list && (string)l["identifier"] == identifier)["id"];
            var website = Pick("application-types", "website");
            var tech = Pick("member-types", "technical-lead");

            // Applications
            var app = await Post(admin, "/api/membership/applications", new { identifier = "gt-test-app", name = "Test App", tags = "demo", disposition = "current", applicationTypeId = website, settings = "" });
            Assert.Equal(HttpStatusCode.OK, app.Status);
            var appId = (int)app.Body["key"];
            Assert.True(appId > 0);
            var dup = await Post(admin, "/api/membership/applications", new { identifier = "gt-test-app", name = "Twin", tags = "demo", disposition = "current", applicationTypeId = website });
            Assert.Equal(HttpStatusCode.Conflict, dup.Status);
            Assert.Contains("identifier", First(dup));
            var bad = await Post(admin, $"/api/membership/applications/{appId}", new { identifier = "gt-test-app", name = "Test App", disposition = "current", applicationTypeId = website, settings = "{not json" });
            Assert.Equal(HttpStatusCode.BadRequest, bad.Status);
            Assert.Contains("JSON", All(bad));
            var empty = await Post(admin, "/api/membership/applications", new { identifier = "", name = "", disposition = "", applicationTypeId = 0 });
            Assert.Equal(HttpStatusCode.BadRequest, empty.Status);
            Assert.True(((JsonArray)empty.Body["errors"]).Count >= 4, "every reason at once");
            var wrongShape = await Post(admin, "/api/membership/applications", new { identifier = 7 });
            Assert.Equal(HttpStatusCode.BadRequest, wrongShape.Status);
            var upd = await Post(admin, $"/api/membership/applications/{appId}", new { identifier = "gt-test-app", name = "Test App Renamed", tags = "demo", disposition = "retired", applicationTypeId = website, settings = "{ \"settings\": { \"owner\": \"x\" } }" });
            Assert.Equal(HttpStatusCode.OK, upd.Status);
            var row = (await admin.GetFromJsonAsync<JsonArray>("/api/membership/applications")).Single(a => (int)a["applicationId"] == appId);
            Assert.Equal(("Test App Renamed", "retired"), ((string)row["name"], (string)row["disposition"]));
            Assert.Contains("owner", (string)row["settings"]);
            var missing = await Post(admin, "/api/membership/applications/999999", new { identifier = "gt-test-nope", name = "Nope", disposition = "current", applicationTypeId = website });
            Assert.Equal(HttpStatusCode.NotFound, missing.Status);

            // Members
            var mem = await Post(admin, "/api/membership/members", new { identifier = "gt-test-member", windowsIdentity = @"DEMO\gt-tester", firstName = "Tess", lastName = "Tester", email = "" });
            Assert.Equal(HttpStatusCode.OK, mem.Status);
            var memId = (int)mem.Body["key"];
            var twin = await Post(admin, "/api/membership/members", new { identifier = "gt-test-twin", windowsIdentity = @"DEMO\gt-tester", firstName = "T", lastName = "Twin" });
            Assert.Equal(HttpStatusCode.Conflict, twin.Status);
            Assert.Contains("Windows identity", First(twin));
            var medit = await Post(admin, $"/api/membership/members/{memId}", new { identifier = "gt-test-member", windowsIdentity = @"DEMO\gt-tester", firstName = "Tessa", lastName = "Tester", email = "tessa@example.com" });
            Assert.Equal(HttpStatusCode.OK, medit.Status);

            // Grants, and the identity lookup sees them at once (the session cache is the only delay at sign-in)
            var g = await Post(admin, "/api/membership/grants/grant", new { memberId = memId, applicationId = appId, roleId = tech });
            Assert.Equal(HttpStatusCode.OK, g.Status);
            Assert.Equal($"{memId}:{appId}:{tech}", (string)g.Body["key"]);
            Assert.Contains("technical-lead", await RolesOn("gt-test-member", "gt-test-app"));
            Assert.Equal(HttpStatusCode.Conflict, (await Post(admin, "/api/membership/grants/grant", new { memberId = memId, applicationId = appId, roleId = tech })).Status);
            Assert.Equal(HttpStatusCode.NotFound, (await Post(admin, "/api/membership/grants/grant", new { memberId = memId, applicationId = appId, roleId = 1 })).Status);
            Assert.Equal(HttpStatusCode.BadRequest, (await Post(admin, "/api/membership/grants/grant", new { memberId = memId })).Status);
            var r = await Post(admin, "/api/membership/grants/revoke", new { memberId = memId, applicationId = appId, roleId = tech });
            Assert.Equal(HttpStatusCode.OK, r.Status);
            Assert.Empty(await RolesOn("gt-test-member", "gt-test-app"));
            Assert.Equal(HttpStatusCode.Conflict, (await Post(admin, "/api/membership/grants/revoke", new { memberId = memId, applicationId = appId, roleId = tech })).Status);

            // History
            var ah = await admin.GetFromJsonAsync<JsonArray>($"/api/membership/audit/application/{appId}");
            Assert.Equal("revoked,granted,updated,created", string.Join(",", ah.Select(e => (string)e["action"])));
            Assert.All(ah, e => Assert.Equal("gt-mb-admin", (string)e["changedBy"]));
            var mh = await admin.GetFromJsonAsync<JsonArray>($"/api/membership/audit/member/{memId}");
            Assert.Equal("revoked,granted,updated,created", string.Join(",", mh.Select(e => (string)e["action"])));
            var updated = ah.First(e => (string)e["action"] == "updated");
            Assert.Equal("Test App", (string)JsonNode.Parse((string)updated["previousValue"])["Name"]);
            Assert.Equal("Test App Renamed", (string)JsonNode.Parse((string)updated["newValue"])["Name"]);
            Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/membership/audit/grant/{appId}")).StatusCode);

            // Parts of an application
            var val = Pick("stages", "VAL");
            var health = Pick("service-types", "health-check");
            var p1 = await Post(admin, "/api/membership/parts/save", new { part = "role", applicationId = appId, roleId = tech, alias = "Lead" });
            Assert.Equal(HttpStatusCode.OK, p1.Status);
            Assert.Equal($"{appId}:{tech}", (string)p1.Body["key"]);
            Assert.Equal(HttpStatusCode.Conflict, (await Post(admin, "/api/membership/parts/save", new { part = "role", applicationId = appId, roleId = tech })).Status);
            Assert.Equal(HttpStatusCode.OK, (await Post(admin, "/api/membership/parts/save", new { part = "stage", applicationId = appId, stageId = val, name = "Val" })).Status);
            Assert.Equal(HttpStatusCode.BadRequest, (await Post(admin, "/api/membership/parts/save", new { part = "stage", applicationId = appId, stageId = val, name = "Validation stage", oldKey = val })).Status);
            var p3 = await Post(admin, "/api/membership/parts/save", new { part = "service", applicationId = appId, serviceTypeId = health, startOn = "2026-10-01", status = "live" });
            Assert.Equal(HttpStatusCode.OK, p3.Status);
            var serviceId = int.Parse(((string)p3.Body["key"]).Split(':')[1]);
            Assert.Equal(HttpStatusCode.OK, (await Post(admin, "/api/membership/parts/save", new { part = "service", applicationId = appId, serviceTypeId = health, startOn = "2026-10-02", status = "paused", oldKey = serviceId })).Status);
            var parts = (await admin.GetFromJsonAsync<JsonArray>("/api/membership/app-parts")).Where(p => (int)p["applicationId"] == appId).ToList();
            Assert.Equal("paused", (string)parts.Single(p => (string)p["part"] == "service")["status"]);
            Assert.Equal(HttpStatusCode.OK, (await Post(admin, "/api/membership/parts/delete", new { part = "stage", applicationId = appId, oldKey = val })).Status);
            Assert.Equal(HttpStatusCode.NotFound, (await Post(admin, "/api/membership/parts/delete", new { part = "stage", applicationId = appId, oldKey = val })).Status);

            // Deletes
            var m2 = await Post(admin, "/api/membership/members", new { identifier = "gt-test-gone", windowsIdentity = @"DEMO\gt-gone", firstName = "Gone", lastName = "Soon" });
            var m2Id = (int)m2.Body["key"];
            await Post(admin, "/api/membership/grants/grant", new { memberId = m2Id, applicationId = appId, roleId = tech });
            Assert.Equal(HttpStatusCode.OK, (await Post(admin, $"/api/membership/members/{m2Id}/delete", new { })).Status);
            Assert.DoesNotContain(await admin.GetFromJsonAsync<JsonArray>("/api/membership/members"), m => (int)m["memberId"] == m2Id);
            var gone = (await admin.GetFromJsonAsync<JsonArray>($"/api/membership/audit/member/{m2Id}")).Single(e => (string)e["action"] == "deleted");
            Assert.Single((JsonArray)JsonNode.Parse((string)gone["previousValue"])["Grants"]);

            Assert.Equal(HttpStatusCode.OK, (await Post(admin, $"/api/membership/applications/{appId}/delete", new { })).Status);
            Assert.DoesNotContain(await admin.GetFromJsonAsync<JsonArray>("/api/membership/applications"), a => (int)a["applicationId"] == appId);
            Assert.DoesNotContain(await admin.GetFromJsonAsync<JsonArray>("/api/membership/app-parts"), p => (int)p["applicationId"] == appId);
            var appGone = (await admin.GetFromJsonAsync<JsonArray>($"/api/membership/audit/application/{appId}")).Single(e => (string)e["entity"] == "application" && (string)e["action"] == "deleted");
            Assert.Single((JsonArray)JsonNode.Parse((string)appGone["previousValue"])["Services"]);
        }
        finally
        {
            await CleanUp(admin);
        }
    }

    // Census's Move It names the demo applications locally; where its tables exist the delete is refused (§7).
    [Fact]
    public async Task Deleting_an_application_another_system_still_names_is_refused_saying_what_names_it()
    {
        var admin = _app.As("gt-mb-admin2", "system-administrator");
        var widget = (await admin.GetFromJsonAsync<JsonArray>("/api/membership/applications")).SingleOrDefault(a => (string)a["identifier"] == "widgetcore");
        Assert.True(widget != null, "Census's demo seed (apptrak\\Invoke-AppTrakDemo.ps1) has not run here.");
        var refused = await Post(admin, $"/api/membership/applications/{(int)widget["applicationId"]}/delete", new { });
        Assert.Equal(HttpStatusCode.Conflict, refused.Status);
        Assert.Contains("release", First(refused));
    }

    private async Task<System.Collections.Generic.List<string>> RolesOn(string identifier, string application)
    {
        using var scope = _app.Services.CreateScope();
        var provider = new MembershipAuthProvider(scope.ServiceProvider.GetRequiredService<IJsonQueryHandler>(), Options.Create(new IdentityOptions { Application = application }));
        var session = new UserSession { UserName = identifier };
        await provider.ResolveAsync(session);
        return session.Roles;
    }

    private static async Task CleanUp(HttpClient admin)
    {
        foreach (var m in (await admin.GetFromJsonAsync<JsonArray>("/api/membership/members")).Where(m => ((string)m["identifier"]).StartsWith("gt-test-")).Select(m => (int)m["memberId"]).Distinct().ToList())
            await admin.PostAsJsonAsync($"/api/membership/members/{m}/delete", new { });
        foreach (var a in (await admin.GetFromJsonAsync<JsonArray>("/api/membership/applications")).Where(a => ((string)a["identifier"]).StartsWith("gt-test-")).Select(a => (int)a["applicationId"]).ToList())
            await admin.PostAsJsonAsync($"/api/membership/applications/{a}/delete", new { });
    }

    private static async Task<(HttpStatusCode Status, JsonNode Body)> Post(HttpClient client, string path, object body)
    {
        var response = await client.PostAsJsonAsync(path, body);
        var text = await response.Content.ReadAsStringAsync();
        return (response.StatusCode, string.IsNullOrEmpty(text) ? null : JsonNode.Parse(text));
    }

    private static string First((HttpStatusCode Status, JsonNode Body) result) => (string)result.Body["errors"][0];

    private static string All((HttpStatusCode Status, JsonNode Body) result) => string.Join(" ", ((JsonArray)result.Body["errors"]).Select(e => (string)e));
}
