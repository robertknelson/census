using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Gatehouse.AppEvents.Data;
using Gatehouse.CommandQuery;
using Gatehouse.Identity;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Gatehouse.AppEvents.Logging;

public class AppEventOptions
{
    public const string SectionName = "AppEvent";

    // The envelope Gatehouse's own events carry (in the live app, the sink's configuration).
    public string Application { get; set; } = "Gatehouse";
    public string Stage { get; set; } = "LOCAL";

    // A unit of work handed off and not received after this many hours counts as stuck (gatehouse.md §12.6).
    public int StuckHours { get; set; } = 4;
}

// Gatehouse's stand-in for the live Serilog sink (gatehouse.md §12.4): it sees the [appevent: template, adds the
// envelope the sink would (application and stage from settings; path, correlation and identifier from the request),
// and queues the event for AppEventWriter. Nothing else that is logged is touched.
public sealed class AppEventLoggerProvider(AppEventQueue queue, IHttpContextAccessor http, IOptions<AppEventOptions> options) : ILoggerProvider
{
    public ILogger CreateLogger(string categoryName) => new AppEventLogger(this);

    public void Dispose()
    {
    }

    private void Capture(IReadOnlyList<KeyValuePair<string, object>> values)
    {
        var format = values.FirstOrDefault(v => v.Key == "{OriginalFormat}").Value as string;
        if (format == null || !format.StartsWith("[appevent:", StringComparison.Ordinal)) return;
        if (JsonNode.Parse(values.First(v => v.Key == "$appevent").Value as string ?? "{}") is not JsonObject e) return;

        var context = http.HttpContext;
        var log = e["Log"] as JsonObject ?? new JsonObject();
        var identifier = (string)e["Identifier"];
        if (string.IsNullOrEmpty(identifier)) identifier = context?.User.FindFirst(ClaimsTransformer.IdentifierClaim)?.Value ?? string.Empty;
        queue.Enqueue(new JsonObject
        {
            ["uid"] = (string)log["Uid"],
            ["identifier"] = identifier,
            ["path"] = context?.Request.Path.Value ?? string.Empty,
            ["sessionId"] = (string)log["SessionId"] ?? string.Empty,
            ["correlationId"] = context?.TraceIdentifier ?? string.Empty,
            ["machine"] = Environment.MachineName,
            ["stage"] = options.Value.Stage,
            ["application"] = options.Value.Application,
            ["startAt"] = log["StartAt"]?.DeepClone(),
            ["namespace"] = (string)e["Namespace"],
            ["commandName"] = (string)e["CommandName"],
            ["commandActivity"] = (string)e["CommandActivity"],
            ["body"] = (string)e["Body"] ?? "{}",
            ["data"] = (string)e["Data"] ?? string.Empty,
            ["workUid"] = (string)e["WorkUid"],
            ["parentUid"] = (string)e["ParentUid"],
            ["subjectType"] = (string)e["SubjectType"],
            ["subjectKey"] = (string)e["SubjectKey"],
            ["message"] = (string)e["Message"],
        });
    }

    private sealed class AppEventLogger(AppEventLoggerProvider provider) : ILogger
    {
        public IDisposable BeginScope<TState>(TState state) => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception exception, Func<TState, Exception, string> formatter)
        {
            if (state is IReadOnlyList<KeyValuePair<string, object>> values) provider.Capture(values);
        }
    }
}

// The events waiting to be written. A request never waits on the write; a full queue drops the oldest, because AppEvent
// is not the audit of record (D11).
public sealed class AppEventQueue
{
    private readonly Channel<JsonObject> _channel = Channel.CreateBounded<JsonObject>(new BoundedChannelOptions(10_000) { FullMode = BoundedChannelFullMode.DropOldest });

    public void Enqueue(JsonObject appEvent) => _channel.Writer.TryWrite(appEvent);

    // How many are waiting (the one being written is not counted).
    public int Pending => _channel.Reader.Count;

    public IAsyncEnumerable<JsonObject> ReadAllAsync(CancellationToken stopping) => _channel.Reader.ReadAllAsync(stopping);
}

// Writes each queued event through one command/query script (app-event-write.sql) to <Logs:Schema>.AppEvent. A write
// that fails is logged and dropped.
public sealed class AppEventWriter(AppEventQueue queue, IServiceScopeFactory scopes, ILogger<AppEventWriter> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var appEvent in queue.ReadAllAsync(stoppingToken))
        {
            using var scope = scopes.CreateScope();
            var commands = scope.ServiceProvider.GetRequiredService<AppEventCommandHandler>();
            var response = await commands.ExecuteAsync(new Parameters().CommandQuery(AppEventsSqlCommandInitializer.Name, "write"), appEvent);
            if (!response.IsOkay) logger.LogWarning("AppEvent {Uid} was not written: {Message}", (string)appEvent["uid"], response.Status.Message);
        }
    }
}
