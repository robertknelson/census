using System.IO;
using Census.Web.Options;
using Census.Web.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Census.Web.CommandQuery;
using Census.Web.FeatureAccess;
using Census.Web.Identity;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authorization;

var builder = WebApplication.CreateBuilder(args);
// Local run settings, never in git: your account in Authorization:SystemAdministrators, say. Environment variables
// and the command line still win over it, as over the other settings files.
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);
builder.Configuration.AddEnvironmentVariables();
builder.Configuration.AddCommandLine(args);

// Add services to the container.
builder.Services.AddControllersWithViews();
builder.Services.Configure<CensusOptions>(builder.Configuration.GetSection(CensusOptions.SectionName));
builder.Services.AddMemoryCache(o => o.SizeLimit = builder.Configuration.GetSection(CensusOptions.SectionName).GetValue<int?>(nameof(CensusOptions.SnapshotCacheEntries)) ?? 1000);
builder.Services.AddSingleton<CensusStore>();
builder.Services.AddSingleton<BlacklistEvaluator>();
builder.Services.AddSingleton<AssetsStore>();
builder.Services.AddSingleton<BaselinesStore>();
builder.Services.AddSingleton<BaselineEvaluator>();
builder.Services.AddSingleton<EntityTagsStore>();
builder.Services.AddSingleton<DeclaredEntitiesStore>();
builder.Services.AddSingleton<SystemsStore>();
builder.Services.AddSingleton<ViewsStore>();
builder.Services.AddSingleton<StageCrossingsStore>();
builder.Services.AddSingleton<GraphComposer>();
builder.Services.AddSingleton<EntityTagsEvaluator>();
builder.Services.AddSingleton<FindingsEngine>();
builder.Services.Configure<MoveItOptions>(builder.Configuration.GetSection(MoveItOptions.SectionName));

// Command/query (census-on-apptrak.md §3): xf-dashboard's handlers as Gatehouse ported them, each key's script under
// apptrak/sql with its shape declared. Stateless, so singletons beside the singleton services that use them.
SqlScripts.Configure(Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath,
    builder.Configuration.GetSection(MoveItOptions.SectionName).Get<MoveItOptions>()?.SqlPath ?? "../apptrak/sql")),
    keep: !builder.Environment.IsDevelopment());
builder.Services.AddSingleton<ISqlCommandInitializer, MoveItSqlCommandInitializer>();
builder.Services.AddSingleton<ISqlCommandInitializer, EntrySqlCommandInitializer>();
builder.Services.AddSingleton<ISqlCommandInitializer, EditSqlCommandInitializer>();
builder.Services.AddSingleton<ISqlCommandInitializer, MembershipSqlCommandInitializer>();
builder.Services.AddSingleton<ISqlCommandInitializer, ResetSqlCommandInitializer>();
builder.Services.AddSingleton<ISqlCommandInitializer, LogsSqlCommandInitializer>();
builder.Services.AddSingleton<IInitializerLocator, SqlCommandInitializerContainer>();
builder.Services.AddSingleton<JsonQueryHandler>();
builder.Services.AddSingleton<JsonCommandHandler>();
builder.Services.AddSingleton<LogsQueryHandler>();
builder.Services.AddSingleton<IJsonQueryHandler>(sp => sp.GetRequiredService<JsonQueryHandler>());
builder.Services.AddSingleton<IJsonCommandHandler>(sp => sp.GetRequiredService<JsonCommandHandler>());
builder.Services.AddSingleton<MoveItQuestions>();
builder.Services.AddSingleton<MoveItEntry>();
builder.Services.Configure<PersonasOptions>(builder.Configuration.GetSection(PersonasOptions.SectionName));
// Feature access (FM2280, copied into FeatureAccess/; personas.md §6.1): features and their role
// grants live in AppTrak's fm schema and are edited on the feature access page. The admin policy is
// the signed-in user being a system administrator on Census (census-on-apptrak.md §10).
var moveIt = builder.Configuration.GetSection(MoveItOptions.SectionName).Get<MoveItOptions>();
builder.Services.AddFeatureAccess(o =>
{
    o.ConnectionString = moveIt?.ConnectionString;
    o.SqlDirectory = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, moveIt?.SqlPath ?? "../apptrak/sql", "fm"));
    o.ConfigureAdminPolicy = policy => policy.RequireClaim(CensusClaims.Administer, "true");
});
builder.Services.AddSingleton<IRoleCatalog, MemberTypesRoleCatalog>();
builder.Services.AddSingleton<MemberAccess>();
builder.Services.AddSingleton<MembershipAdmin>();
builder.Services.AddSingleton<MoveItEdit>();
builder.Services.AddSingleton<MoveItScope>();
builder.Services.AddSingleton<AssertionReset>();

// Identity and impersonation (census-on-apptrak.md §10): Windows sign-in, every request signed in unless an endpoint
// says otherwise, the user resolved from AppTrak's membership, and a system administrator able to act as a member.
builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate();
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    options.AddPolicy(CensusClaims.AdministerPolicy, policy => policy.RequireClaim(CensusClaims.Administer, "true"));
});
builder.Services.Configure<IdentityOptions>(builder.Configuration.GetSection(IdentityOptions.SectionName));
builder.Services.Configure<ImpersonationOptions>(builder.Configuration.GetSection(ImpersonationOptions.SectionName));
builder.Services.AddSingleton<ImpersonationStore>();
builder.Services.AddTransient<IClaimsTransformation, ClaimsTransformer>();
builder.Services.Configure<LogsOptions>(builder.Configuration.GetSection(LogsOptions.SectionName));
builder.Services.AddSingleton<LogReader>();
builder.Services.AddSingleton<TraceReader>();
builder.Services.Configure<UsageOptions>(builder.Configuration.GetSection(UsageOptions.SectionName));
builder.Services.AddSingleton<UsageReader>();

var app = builder.Build();

StageOrder.Configure(app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<CensusOptions>>().Value.StageOrder);

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

// In development (and the demo profile), browsers heuristically cache the ES modules and
// serve stale code after edits; force revalidation so a plain refresh always reflects the
// working tree.
app.UseStaticFiles(app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Demo")
    ? new StaticFileOptions
    {
        OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "no-cache",
    }
    : new StaticFileOptions());

app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
