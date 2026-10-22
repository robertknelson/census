using System.Text.Json.Nodes;

namespace Census.Web.FeatureAccess.Data
{
    public enum FeatureResponseStatus
    {
        Ok,
        Invalid,
        NotFound,
        Conflict
    }

    public class FeatureResponse
    {
        public FeatureResponseStatus Status { get; private init; }

        public string Message { get; private init; }

        public JsonNode Data { get; private init; }

        public static FeatureResponse Ok(JsonNode data) => new() { Status = FeatureResponseStatus.Ok, Data = data };

        public static FeatureResponse Invalid(string message) => new() { Status = FeatureResponseStatus.Invalid, Message = message };

        public static FeatureResponse NotFound(string message) => new() { Status = FeatureResponseStatus.NotFound, Message = message };

        public static FeatureResponse Conflict(string message) => new() { Status = FeatureResponseStatus.Conflict, Message = message };
    }
}
