using Gatehouse.AppEvents.Logging;

namespace Gatehouse.Membership;

// The request to join as a unit of work (gatehouse.md §12.4): one kind, and Uids derived from the request's id, so the
// decision finds the request's unit and its first step without a lookup.
public static class AccessRequest
{
    public const string Namespace = "membership";
    public const string CommandName = "access-request";

    public static string WorkUid(int requestId) => AppActivity.DerivedUid($"access-request:{requestId}");

    public static string CreatedUid(int requestId) => AppActivity.DerivedUid($"access-request:{requestId}:created");
}
