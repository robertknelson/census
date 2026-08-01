using Census.Web.Options;
using Census.Web.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();
builder.Services.Configure<CensusOptions>(builder.Configuration.GetSection(CensusOptions.SectionName));
builder.Services.AddSingleton<CensusStore>();
builder.Services.AddSingleton<BlacklistEvaluator>();
builder.Services.AddSingleton<AssetsStore>();
builder.Services.AddSingleton<FindingsEngine>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();

app.UseAuthorization();

app.MapControllers();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
