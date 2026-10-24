using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Gatehouse.CommandQuery;
using Gatehouse.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace Gatehouse.Tests;

// The visitor welcome and the request to join (gatehouse.md §11), both halves, against the local AppTrak: what a
// visitor sees and is refused, the request (its identity from the sign-in only), and an administrator approving and
// declining. Visitors are gt-visitor-<run>-*, removed before and after by sql\cleanup-test-visitors.sql.
// One collection with the other visitor tests: their clean-ups remove every gt-visitor-* row.
[Collection("visitors")]
public class WelcomeEndToEndTests : IClassFixture<GatingEndToEndTests.App>, IAsyncLifetime
{
    private readonly GatingEndToEndTests.App _app;
    private readonly string _run = Guid.NewGuid().ToString("N")[..6];

    public WelcomeEndToEndTests(GatingEndToEndTests.App app) => _app = app;

    public Task InitializeAsync() => VisitorCleanUp.RunAsync(_app);

    public Task DisposeAsync() => VisitorCleanUp.RunAsync(_app);

    [Fact]
    public async Task A_visitor_is_sent_to_the_welcome_and_refused_everything_else()
    {
        var visitor = _app.AsVisitor($"gt-visitor-{_run}-a");
        var home = await visitor.GetAsync("/");
        Assert.Equal("/welcome", home.RequestMessage.RequestUri.AbsolutePath);
        var page = await home.Content.ReadAsStringAsync();
        Assert.Contains(">Welcome", page);
        Assert.DoesNotContain(">Home</a>", page);
        Assert.DoesNotContain(">Log Explorer</a>", page);
        foreach (var path in new[] { "/logs", "/admin/membership", "/admin/feature-access", "/api/membership/requests", "/api/feature-access/features" })
            Assert.Equal(HttpStatusCode.Forbidden, (await visitor.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task A_member_is_refused_the_welcome()
    {
        var member = _app.As($"gt-member-{_run}", "technical-lead");
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("/welcome")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("/api/welcome")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsJsonAsync("/api/welcome/request", new { })).StatusCode);
        Assert.DoesNotContain(">Welcome", await member.GetStringAsync("/"));
    }

    [Fact]
    public async Task A_request_is_sent_once_approved_by_an_administrator_and_becomes_a_member()
    {
        var name = $"gt-visitor-{_run}-b";
        var visitor = _app.AsVisitor(name);
        var welcome = await visitor.GetFromJsonAsync<JsonObject>("/api/welcome");
        Assert.Equal($@"TEST\{name}", (string)welcome["windowsIdentity"]);
        Assert.Null(welcome["request"]);
        int App(string identifier) => (int)((JsonArray)welcome["applications"]).Single(a => (string)a["identifier"] == identifier)["id"];
        int Role(string identifier) => (int)((JsonArray)welcome["roles"]).Single(r => (string)r["identifier"] == identifier)["id"];

        var empty = await Post(visitor, "/api/welcome/request", new { });
        Assert.Equal(HttpStatusCode.BadRequest, empty.Status);
        Assert.True(((JsonArray)empty.Body["errors"]).Count >= 6, "every reason at once");
        var notOffered = await Post(visitor, "/api/welcome/request", Ask(Role("product-owner"), 999999));
        Assert.Equal(HttpStatusCode.BadRequest, notOffered.Status);

        // A body that names someone else is ignored: the request is the signed-in user's.
        var asked = await Post(visitor, "/api/welcome/request", new
        {
            windowsIdentity = @"TEST\someone-else", identifier = "someone-else",
            firstName = "Vera", lastName = "Visitor", email = "vera@example.com", reason = "I own the widget releases.",
            roleId = Role("product-owner"), applicationIds = new[] { App("gatehouse"), App("widgetcore") },
        });
        Assert.Equal(HttpStatusCode.OK, asked.Status);
        var requestId = (int)asked.Body["key"];
        var mine = (await visitor.GetFromJsonAsync<JsonObject>("/api/welcome"))["request"];
        Assert.Equal(("pending", $@"TEST\{name}", "Product Owner"), ((string)mine["status"], (string)mine["windowsIdentity"], (string)mine["role"]));
        Assert.Contains("WidgetCore", (string)mine["applications"]);
        Assert.Equal(HttpStatusCode.Conflict, (await Post(visitor, "/api/welcome/request", Ask(Role("product-owner"), App("gatehouse")))).Status);

        // The administrator's half.
        var admin = _app.As($"gt-admin-{_run}", "system-administrator");
        var listed = (await admin.GetFromJsonAsync<JsonArray>("/api/membership/requests")).Single(r => (int)r["membershipRequestId"] == requestId);
        Assert.Equal(name, (string)listed["identifier"]);
        Assert.Matches("gh-count\"[^>]*>[1-9]", await admin.GetStringAsync("/"));
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(admin, $"/api/membership/requests/{requestId}/approve", new { roleId = Role("technical-lead") })).Status);
        var approved = await Post(admin, $"/api/membership/requests/{requestId}/approve",
            new { roleId = Role("technical-lead"), applicationIds = new[] { App("gatehouse") }, note = "Welcome." });
        Assert.Equal(HttpStatusCode.OK, approved.Status);
        Assert.True((int)approved.Body["memberId"] > 0);
        Assert.Equal(HttpStatusCode.Conflict, (await Post(admin, $"/api/membership/requests/{requestId}/approve",
            new { roleId = Role("technical-lead"), applicationIds = new[] { App("gatehouse") } })).Status);

        // The role the approver chose, on the application kept, and nothing on the one dropped.
        Assert.Equal(new[] { "technical-lead" }, (await RolesOn(name, "gatehouse")).ToArray());
        Assert.Empty(await RolesOn(name, "widgetcore"));
        var history = await admin.GetFromJsonAsync<JsonArray>("/api/membership/audit/recent");
        Assert.Contains(history, e => (string)e["entity"] == "request" && (string)e["action"] == "approved" && (string)e["entityKey"] == requestId.ToString());
        Assert.Equal("approved", (string)(await visitor.GetFromJsonAsync<JsonObject>("/api/welcome"))["request"]["status"]);
        Assert.Equal(HttpStatusCode.Conflict, (await Post(visitor, "/api/welcome/request", Ask(Role("product-owner"), App("gatehouse")))).Status);
    }

    [Fact]
    public async Task A_declined_request_says_why_and_the_visitor_may_ask_again()
    {
        var visitor = _app.AsVisitor($"gt-visitor-{_run}-c");
        var welcome = await visitor.GetFromJsonAsync<JsonObject>("/api/welcome");
        var role = (int)welcome["roles"][0]["id"];
        var app = (int)welcome["applications"][0]["id"];
        var requestId = (int)(await Post(visitor, "/api/welcome/request", Ask(role, app))).Body["key"];

        var admin = _app.As($"gt-admin2-{_run}", "system-administrator");
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(admin, $"/api/membership/requests/{requestId}/decline", new { })).Status);
        Assert.Equal(HttpStatusCode.OK, (await Post(admin, $"/api/membership/requests/{requestId}/decline", new { note = "Ask your manager to sponsor you." })).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await Post(admin, "/api/membership/requests/999999/decline", new { note = "x" })).Status);

        var mine = (await visitor.GetFromJsonAsync<JsonObject>("/api/welcome"))["request"];
        Assert.Equal(("declined", "Ask your manager to sponsor you."), ((string)mine["status"], (string)mine["decisionNote"]));
        Assert.Equal(HttpStatusCode.OK, (await Post(visitor, "/api/welcome/request", Ask(role, app))).Status);
    }

    private static object Ask(int roleId, params int[] applicationIds) =>
        new { firstName = "Vera", lastName = "Visitor", email = "vera@example.com", reason = "Testing.", roleId, applicationIds };

    private async Task<System.Collections.Generic.List<string>> RolesOn(string identifier, string application)
    {
        using var scope = _app.Services.CreateScope();
        var provider = new MembershipAuthProvider(scope.ServiceProvider.GetRequiredService<IJsonQueryHandler>(), Options.Create(new IdentityOptions { Application = application }));
        var session = new UserSession { UserName = identifier };
        await provider.ResolveAsync(session);
        return session.Roles;
    }


    private static async Task<(HttpStatusCode Status, JsonNode Body)> Post(HttpClient client, string path, object body)
    {
        var response = await client.PostAsJsonAsync(path, body);
        var text = await response.Content.ReadAsStringAsync();
        return (response.StatusCode, string.IsNullOrEmpty(text) ? null : JsonNode.Parse(text));
    }
}
