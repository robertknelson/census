using Gatehouse.AppEvents.Data;
using Gatehouse.CommandQuery;
using Gatehouse.FeatureManagement;
using Gatehouse.Identity;
using Gatehouse.Logs;
using Gatehouse.Logs.Api;
using Gatehouse.Logs.Data;
using Gatehouse.Membership.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

// Gatehouse (.docs/features/gatehouse.md): a reference app for porting Feature Management, Membership and Logs into a
// live app with a sidebar, Windows sign-in with a claims transformation, and command/query handlers.

var builder = WebApplication.CreateBuilder(args);
// Local run settings, never in git: your account in Authorization:SystemAdministrators, say.
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

builder.Services.AddControllersWithViews();

// Windows sign-in, and every request signed in unless an endpoint says otherwise (deny by default, gatehouse.md §6).
builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate();
builder.Services.AddAuthorization(options => options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

// Command/query (§4): the handlers, and every component's initializers found by key.
builder.Services.AddScoped<IJsonQueryHandler, JsonQueryHandler>();
builder.Services.AddScoped<IJsonCommandHandler, JsonCommandHandler>();
builder.Services.AddTransient<IInitializerLocator, SqlCommandInitializerContainer>();

// Identity (§5): DOMAIN\username → membership's roles on this application, as role claims.
builder.Services.Configure<IdentityOptions>(builder.Configuration.GetSection(IdentityOptions.SectionName));
builder.Services.AddTransient<ISqlCommandInitializer, IdentitySqlCommandInitializer>();
builder.Services.AddScoped<IAuthProvider, MembershipAuthProvider>();
builder.Services.AddTransient<IClaimsTransformation, ClaimsTransformer>();

// Feature Management (§6): FM2280 on command/query, the sidebar filter, the fixed admin policy.
builder.Services.Configure<FeatureAccessOptions>(builder.Configuration.GetSection(FeatureAccessOptions.SectionName));
var featureAccess = builder.Configuration.GetSection(FeatureAccessOptions.SectionName).Get<FeatureAccessOptions>() ?? new FeatureAccessOptions();
builder.Services.AddGatehouseFeatureManagement(featureAccess.AdminRole);

// Membership (§7): Census's membership page on command/query, behind the admin.membership feature.
builder.Services.AddTransient<ISqlCommandInitializer, MembershipSqlCommandInitializer>();

// Logs (§7): Log Explorer, Trace and Usage on command/query, reading the log tables through the "logs" connection.
builder.Services.Configure<LogsOptions>(builder.Configuration.GetSection(LogsOptions.SectionName));
builder.Services.Configure<UsageOptions>(builder.Configuration.GetSection(UsageOptions.SectionName));
builder.Services.AddTransient<ISqlCommandInitializer, LogsSqlCommandInitializer>();
builder.Services.AddScoped<LogsQueryHandler>();

// AppEvent (§12): the catalog of kinds in AppTrak; the events in the log tables.
builder.Services.AddTransient<ISqlCommandInitializer, AppEventsSqlCommandInitializer>();
builder.Services.AddScoped<AppEventCommandHandler>();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/error");
}

app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();

// The test project reaches the app's controllers through this type.
public partial class Program
{
}
