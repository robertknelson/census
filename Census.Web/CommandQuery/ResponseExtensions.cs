using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using Census.Web.Identity;
using Census.Web.Services;

namespace Census.Web.CommandQuery;

// The services keep the shapes their controllers already return (census-on-apptrak.md §3: a gradual move, so every API
// answers as before): rows as column → value, a write as WriteResult. A read the database could not answer throws,
// as it did before the move; a write's refusal is its status.
public static class ResponseExtensions
{
    // Key("board.releases", ("Name", value), ...) → the parameters for census.board.releases with those values.
    public static IParameters Key(string nameAction, params (string Name, object Value)[] values)
    {
        var parameters = new Parameters();
        parameters.AddParam("key", $"{SqlCommandInitializer.DomainName}.{nameAction}");
        foreach (var (name, value) in values) parameters[name] = value;
        return parameters;
    }

    // A write's two actor values (census-on-apptrak.md §10.3).
    public static IParameters By(this IParameters parameters, Actor actor) =>
        parameters.AddParam("Actor", actor.Identifier).AddParam("ImpersonatedBy", actor.ImpersonatedBy);

    public static List<Dictionary<string, object>> Rows(this Response<JsonNode> response)
    {
        Ensure(response);
        return response.Items.Select(item => item.AsObject().ToDictionary(kv => kv.Key, kv => Value(kv.Value))).ToList();
    }

    public static Dictionary<string, object> FirstRow(this Response<JsonNode> response) => response.Rows().FirstOrDefault();

    // The FOR JSON document as SQL Server wrote it; null when it wrote nothing.
    public static string Json(this Response<JsonNode> response)
    {
        Ensure(response);
        return response.Model?.GetValue<string>();
    }

    public static WriteResult ToWriteResult(this Response<JsonNode> response) => response.Status.HttpCode switch
    {
        200 => new WriteResult { Status = 200, Key = Value(response.Model)?.ToString() },
        500 => throw new InvalidOperationException(response.Status.SystemMessage ?? response.Status.Message),
        var code => new WriteResult { Status = code, Message = response.Status.Message },
    };

    private static void Ensure(Response response)
    {
        if (!response.IsOkay) throw new InvalidOperationException($"{response.Action}: {response.Status.SystemMessage ?? response.Status.Message}");
    }

    private static object Value(JsonNode node) => node switch
    {
        null => null,
        JsonValue v when v.TryGetValue<object>(out var o) => o,
        _ => node.ToJsonString(),
    };
}
