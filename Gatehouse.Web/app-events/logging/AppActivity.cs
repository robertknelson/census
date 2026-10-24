using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Gatehouse.AppEvents.Data;
using Microsoft.Extensions.Logging;

namespace Gatehouse.AppEvents.Logging;

// One step of a unit of business work, as the code that did it reports it (gatehouse.md §12.4, app-event.md D2–D9).
// The kind is Namespace + a NOUN-VERB CommandName; the step is one of the lifecycle words (AE-R1). The event's own Uid
// and the moment it happened are filled here, where it happened; the envelope (application, stage, machine,
// correlation) is the sink's.
public sealed class AppActivity
{
    public string Namespace { get; init; }
    public string CommandName { get; init; }
    public string Activity { get; init; }

    // The plain words any reader shows ("Approved the request to join from Vera Visitor").
    public string Message { get; init; }

    // The unit of work every system that touches it carries, and the event that caused this one.
    public string WorkUid { get; init; }
    public string ParentUid { get; init; }

    // The record the event is about (policy / 123).
    public string SubjectType { get; init; }
    public string SubjectKey { get; init; }

    // The business payload, serialized as JSON.
    public object Body { get; init; }

    // Who and which session, when the caller knows better than the log context.
    public string Identifier { get; init; }
    public string SessionId { get; init; }

    public string Uid { get; init; } = Guid.NewGuid().ToString("D");
    public DateTimeOffset StartAt { get; init; } = DateTimeOffset.Now;

    // A Uid every system can work out again from the same words (a request's id, say), so a unit of work started in one
    // place is found in another without a lookup.
    public static string DerivedUid(string seed) => new Guid(MD5.HashData(Encoding.UTF8.GetBytes(seed))).ToString("D");
}

public static class AppActivityLogging
{
    // xf-dashboard's SerilogMessageTemplates.AppEventFormat: the template its Serilog sink routes to AppEvent.
    public const string Template = "[appevent:{$appevent}/] [uid:{uid}] [sid:{sid}] [identifier:{$identifier}]";

    private static readonly JsonSerializerOptions Json = new();

    // Logs the step and returns its Uid (to give the next step as its parent). A malformed event is a programming error
    // and throws here, at the caller, rather than becoming a row nobody can aggregate.
    public static string LogActivity(this ILogger logger, AppActivity activity)
    {
        ArgumentNullException.ThrowIfNull(activity);
        var problem = AppEventNames.CheckNamespace(activity.Namespace) ?? AppEventNames.CheckCommandName(activity.CommandName)
            ?? AppEventNames.CheckActivity(activity.Activity);
        if (problem != null) throw new ArgumentException(problem, nameof(activity));

        logger.LogInformation(Template, Serialize(activity), activity.Uid, activity.SessionId ?? string.Empty, activity.Identifier ?? string.Empty);
        return activity.Uid;
    }

    // The shape xf-dashboard's sink deserializes (XF.Common.AppEvent and its LogInfo), plus the five columns AppEvent
    // gains (gatehouse.md §12.2). Body is a string of JSON, as the table holds it.
    public static string Serialize(AppActivity a) => JsonSerializer.Serialize(new
    {
        Log = new { a.Uid, Identifier = a.Identifier ?? string.Empty, SessionId = a.SessionId ?? string.Empty, a.StartAt },
        Identifier = a.Identifier ?? string.Empty,
        a.Namespace,
        a.CommandName,
        CommandActivity = a.Activity,
        Body = a.Body == null ? "{}" : JsonSerializer.Serialize(a.Body, Json),
        Data = string.Empty,
        IsFromApi = false,
        a.WorkUid,
        a.ParentUid,
        a.SubjectType,
        a.SubjectKey,
        a.Message,
    }, Json);
}
