using System;
using System.Linq;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Gatehouse.AppEvents.Logging;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace Gatehouse.Tests;

// LogActivity and the provider that stands in for the live sink (gatehouse.md §12.4, A-2), without a database: a
// malformed event is refused at the caller; a good one is logged in xf-dashboard's [appevent: template, and the
// provider turns it into the row it writes, with the envelope added.
public class AppActivityTests
{
    private static readonly AppActivity Good = new()
    {
        Namespace = "underwriting", CommandName = "quote-request", Activity = "handed-off", Message = "Sent the quote request",
        WorkUid = "11111111-1111-1111-1111-111111111111", ParentUid = "22222222-2222-2222-2222-222222222222",
        SubjectType = "policy", SubjectKey = "POL-1", Identifier = "jdoe", Body = new { policy = "POL-1" },
    };

    [Theory]
    [InlineData("Underwriting", "quote-request", "created", "kebab-case")]
    [InlineData("underwriting", "quote", "created", "NOUN-VERB")]
    [InlineData("underwriting", "quote-request", "done", "one of created, handed-off")]
    public void A_malformed_event_is_refused_at_the_caller(string ns, string command, string activity, string reason)
    {
        var error = Assert.Throws<ArgumentException>(() =>
            new LoggerFactory().CreateLogger("t").LogActivity(new AppActivity { Namespace = ns, CommandName = command, Activity = activity }));
        Assert.Contains(reason, error.Message);
    }

    [Fact]
    public void The_event_is_serialized_in_the_shape_the_live_sink_reads_plus_the_new_columns()
    {
        var e = JsonNode.Parse(AppActivityLogging.Serialize(Good));
        Assert.Equal(Good.Uid, (string)e["Log"]["Uid"]);
        Assert.Equal(("underwriting", "quote-request", "handed-off"), ((string)e["Namespace"], (string)e["CommandName"], (string)e["CommandActivity"]));
        Assert.Equal("{\"policy\":\"POL-1\"}", (string)e["Body"]);
        Assert.Equal((Good.WorkUid, Good.ParentUid, "policy", "POL-1"), ((string)e["WorkUid"], (string)e["ParentUid"], (string)e["SubjectType"], (string)e["SubjectKey"]));
        Assert.StartsWith("[appevent:", AppActivityLogging.Template);
    }

    [Fact]
    public async Task The_provider_turns_a_logged_activity_into_its_row_and_leaves_other_logs_alone()
    {
        var queue = new AppEventQueue();
        var provider = new AppEventLoggerProvider(queue, new HttpContextAccessor(), Options.Create(new AppEventOptions { Application = "Gatehouse", Stage = "TEST" }));
        using var factory = new LoggerFactory(new[] { provider });
        var logger = factory.CreateLogger("t");
        logger.LogInformation("An ordinary message {Value}", 1);
        logger.LogActivity(Good);

        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var row = await queue.ReadAllAsync(stop.Token).FirstAsync(stop.Token);
        Assert.Equal(Good.Uid, (string)row["uid"]);
        Assert.Equal(("Gatehouse", "TEST", "jdoe"), ((string)row["application"], (string)row["stage"], (string)row["identifier"]));
        Assert.Equal(("handed-off", Good.WorkUid, "Sent the quote request"), ((string)row["commandActivity"], (string)row["workUid"], (string)row["message"]));
        Assert.Equal(Good.StartAt, (DateTimeOffset)row["startAt"]);
    }

    [Fact]
    public void A_derived_uid_is_the_same_wherever_it_is_worked_out()
    {
        Assert.Equal(AppActivity.DerivedUid("access-request:7"), AppActivity.DerivedUid("access-request:7"));
        Assert.NotEqual(AppActivity.DerivedUid("access-request:7"), AppActivity.DerivedUid("access-request:8"));
        Assert.True(Guid.TryParse(AppActivity.DerivedUid("x"), out _));
    }
}

internal static class AsyncEnumerableExtensions
{
    public static async Task<T> FirstAsync<T>(this System.Collections.Generic.IAsyncEnumerable<T> items, CancellationToken token)
    {
        await foreach (var item in items.WithCancellation(token)) return item;
        throw new InvalidOperationException("Nothing arrived.");
    }
}
