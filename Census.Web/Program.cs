using Census.Web.Options;
using Census.Web.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();
builder.Services.Configure<CensusOptions>(builder.Configuration.GetSection(CensusOptions.SectionName));
builder.Services.AddSingleton<CensusStore>();
builder.Services.AddSingleton<BlacklistEvaluator>();
builder.Services.AddSingleton<AssetsStore>();
builder.Services.AddSingleton<BaselinesStore>();
builder.Services.AddSingleton<BaselineEvaluator>();
builder.Services.AddSingleton<EntityTagsStore>();
builder.Services.AddSingleton<DeclaredEntitiesStore>();
builder.Services.AddSingleton<SystemsStore>();
builder.Services.AddSingleton<ViewsStore>();
builder.Services.AddSingleton<EntityTagsEvaluator>();
builder.Services.AddSingleton<FindingsEngine>();
builder.Services.Configure<MoveItOptions>(builder.Configuration.GetSection(MoveItOptions.SectionName));
builder.Services.AddSingleton<MoveItQuestions>();

var app = builder.Build();

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
