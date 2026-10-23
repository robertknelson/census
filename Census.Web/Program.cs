using System.IO;
using Census.Web.Options;
using Census.Web.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Census.Web.FeatureAccess;

var builder = WebApplication.CreateBuilder(args);

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
builder.Services.AddSingleton<MoveItQuestions>();
builder.Services.AddSingleton<MoveItEntry>();
builder.Services.Configure<PersonasOptions>(builder.Configuration.GetSection(PersonasOptions.SectionName));
// Feature access (FM2280, copied into FeatureAccess/; personas.md §6.1): features and their role
// grants live in AppTrak's fm schema and are edited on the feature access page. The admin policy
// lets everyone through for now: Census has no sign-in yet, and the page is offered only to a
// Sys Admin in the persona UX. It becomes a real role check when identity arrives (open item).
var moveIt = builder.Configuration.GetSection(MoveItOptions.SectionName).Get<MoveItOptions>();
builder.Services.AddFeatureAccess(o =>
{
    o.ConnectionString = moveIt?.ConnectionString;
    o.SqlDirectory = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, moveIt?.SqlPath ?? "../apptrak/sql", "fm"));
    o.ConfigureAdminPolicy = policy => policy.RequireAssertion(_ => true);
});
builder.Services.AddSingleton<IRoleCatalog, MemberTypesRoleCatalog>();
builder.Services.AddSingleton<MemberAccess>();
builder.Services.AddSingleton<MembershipAdmin>();
builder.Services.AddSingleton<MoveItEdit>();
builder.Services.Configure<LogsOptions>(builder.Configuration.GetSection(LogsOptions.SectionName));
builder.Services.AddSingleton<LogReader>();
builder.Services.AddSingleton<TraceReader>();
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

app.UseAuthorization();

app.MapControllers();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
