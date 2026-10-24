using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Gatehouse.Identity;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace Gatehouse.Tests;

// Both halves of the rule, end to end (gatehouse.md §6): the sidebar shows what a role may open, and the server refuses
// the rest. Windows sign-in is replaced by a test scheme ("X-Test-User" names the user) and membership by a stub that
// hands each user the roles a test gives them; the features are the real ones in the local GatehouseDemo fm
// (setup\Invoke-GatehouseDemo.ps1).
public class GatingEndToEndTests : IClassFixture<GatingEndToEndTests.App>
{
    private readonly App _app;

    public GatingEndToEndTests(App app) => _app = app;

    [Fact]
    public async Task A_system_administrator_sees_every_item_and_opens_every_page()
    {
        var client = _app.As("gt-admin", "system-administrator");
        var home = await client.GetStringAsync("/");
        foreach (var item in new[] { "Log Explorer", "Trace", "Usage", "Membership", "Feature access" }) Assert.Contains($">{item}</a>", home);
        foreach (var page in new[] { "/logs", "/trace", "/usage", "/admin/membership", "/admin/feature-access", "/api/feature-access/features" })
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(page)).StatusCode);
    }

    [Fact]
    public async Task A_technical_lead_sees_the_logs_and_is_refused_the_administration()
    {
        var client = _app.As("gt-lead", "technical-lead");
        var home = await client.GetStringAsync("/");
        Assert.Contains(">Log Explorer</a>", home);
        Assert.DoesNotContain(">Membership</a>", home);
        Assert.DoesNotContain(">Feature access</a>", home);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/logs")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/admin/membership")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/admin/feature-access")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/feature-access/features")).StatusCode);
    }

    [Fact]
    public async Task A_member_with_no_role_here_sees_home_only()
    {
        var client = _app.As("gt-nobody");
        var home = await client.GetStringAsync("/");
        Assert.Contains(">Home</a>", home);
        Assert.DoesNotContain(">Log Explorer</a>", home);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/logs")).StatusCode);
    }

    [Fact]
    public async Task Nobody_signed_in_is_refused_everywhere()
    {
        var client = _app.CreateClient();
        var home = await client.GetAsync("/");
        Assert.True(home.StatusCode == HttpStatusCode.Unauthorized, await home.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/logs")).StatusCode);
    }

    [Fact]
    public async Task Switching_a_feature_off_hides_its_item_and_refuses_its_page_without_a_restart()
    {
        var admin = _app.As("gt-admin2", "system-administrator");
        var lead = _app.As("gt-lead2", "technical-lead");
        var trace = (await admin.GetFromJsonAsync<JsonArray>("/api/feature-access/features")).Single(f => (string)f["name"] == "logs.trace");
        var id = (int)trace["featureId"];
        try
        {
            var off = await admin.PostAsJsonAsync($"/api/feature-access/features/{id}/set-enabled", new { isEnabled = false, rowVersion = (string)trace["rowVersion"] });
            Assert.Equal(HttpStatusCode.OK, off.StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await lead.GetAsync("/trace")).StatusCode);
            Assert.DoesNotContain(">Trace</a>", await lead.GetStringAsync("/"));
        }
        finally
        {
            var now = await admin.GetFromJsonAsync<JsonObject>($"/api/feature-access/features/{id}");
            await admin.PostAsJsonAsync($"/api/feature-access/features/{id}/set-enabled", new { isEnabled = true, rowVersion = (string)now["rowVersion"] });
        }
        Assert.Equal(HttpStatusCode.OK, (await lead.GetAsync("/trace")).StatusCode);
    }

    [Fact]
    public async Task The_admin_api_refuses_a_bad_name_and_a_stale_row_version()
    {
        var admin = _app.As("gt-admin3", "system-administrator");
        var bad = await admin.PostAsJsonAsync("/api/feature-access/features", new { name = "Not A Name", displayName = "x" });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        var usage = (await admin.GetFromJsonAsync<JsonArray>("/api/feature-access/features")).Single(f => (string)f["name"] == "logs.usage");
        var stale = await admin.PostAsJsonAsync($"/api/feature-access/features/{(int)usage["featureId"]}/set-enabled", new { isEnabled = true, rowVersion = "1" });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        var missing = await admin.GetAsync("/api/feature-access/features/999999");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    public class App : WebApplicationFactory<Program>
    {
        public static readonly ConcurrentDictionary<string, string[]> Roles = new();
        public static readonly ConcurrentDictionary<string, bool> Visitors = new();

        public HttpClient As(string user, params string[] roles)
        {
            Roles[user] = roles;
            var client = CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-User", $@"TEST\{user}");
            return client;
        }

        // Signed in by Windows with no membership.Member row (gatehouse.md §11.1).
        public HttpClient AsVisitor(string user)
        {
            Visitors[user] = true;
            var client = CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-User", $@"TEST\{user}");
            return client;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureTestServices(services =>
            {
                services.AddAuthentication(TestAuth.Scheme).AddScheme<AuthenticationSchemeOptions, TestAuth>(TestAuth.Scheme, _ => { });
                services.AddScoped<IAuthProvider, StubAuthProvider>();
                // Windows sign-in looks at every request and needs Kestrel's connection; the test server has none.
                services.AddSingleton<IAuthenticationSchemeProvider, NoNegotiateSchemes>();
            });
        }
    }

    private sealed class NoNegotiateSchemes(IOptions<AuthenticationOptions> options) : AuthenticationSchemeProvider(options)
    {
        public override Task<IEnumerable<AuthenticationScheme>> GetRequestHandlerSchemesAsync() =>
            Task.FromResult(Enumerable.Empty<AuthenticationScheme>());
    }

    private sealed class StubAuthProvider : IAuthProvider
    {
        public Task ResolveAsync(UserSession session)
        {
            session.IsMember = !App.Visitors.ContainsKey(session.UserName);
            session.FirstName = session.UserName;
            session.Roles = App.Roles.TryGetValue(session.UserName, out var roles) ? roles.ToList() : new();
            return Task.CompletedTask;
        }
    }

    private sealed class TestAuth(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string Scheme = "Test";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-User", out var user)) return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, user.ToString()) }, Scheme);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
        }
    }
}
