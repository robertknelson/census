using System;
using System.IO;
using System.Threading.Tasks;
using Gatehouse.AppEvents.Logging;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Gatehouse.Tests;

// What the visitor tests leave in the LOCAL databases: the gt-visitor-* requests and members (AppTrak), and the
// access-request events their asks and decisions log (the logs database). The events are written behind the request,
// so the writer's queue is let drain first.
public static class VisitorCleanUp
{
    public static async Task RunAsync(GatingEndToEndTests.App app)
    {
        var queue = app.Services.GetRequiredService<AppEventQueue>();
        for (var i = 0; i < 30 && queue.Pending > 0; i++) await Task.Delay(100);
        await Task.Delay(300);
        var configuration = app.Services.GetRequiredService<IConfiguration>();
        foreach (var (file, connection) in new[] { ("cleanup-test-visitors.sql", "default"), ("cleanup-test-app-events.sql", "logs") })
        {
            await using var sql = new SqlConnection(configuration.GetConnectionString(connection));
            await sql.OpenAsync();
            await using var command = new SqlCommand(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "sql", file)), sql);
            await command.ExecuteNonQueryAsync();
        }
    }
}
