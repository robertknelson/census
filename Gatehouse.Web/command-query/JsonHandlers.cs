using System;
using System.Data.Common;
using System.Text;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Gatehouse.CommandQuery;

// xf-dashboard's JsonQueryHandler and JsonCommandHandler (gatehouse.md §4), with the result shape still chosen from the
// script's text as there: FOR JSON → one JSON document; OUTPUT or SCOPE_IDENTITY (commands) → rows; else a query's rows
// or a command's rows-affected. Different from xf-dashboard (open-items #27 there):
//   * the async methods are real, and the sync ones do not block on them;
//   * rows are kept on every path;
//   * a top-level FOR JSON that SQL Server splits into rows of ~2,033 characters is read whole;
//   * THROW 50400 / 50404 / 50409, a unique-key violation and a foreign-key refusal set the status code, so a controller
//     can answer 400 / 404 / 409.
public abstract class JsonHandler
{
    private readonly IConfiguration _configuration;
    protected readonly ILogger Logger;
    protected readonly IInitializerLocator InitializerLocator;

    protected JsonHandler(IInitializerLocator initializerLocator, ILogger logger, IConfiguration configuration)
    {
        InitializerLocator = initializerLocator;
        Logger = logger;
        _configuration = configuration;
    }

    // The connection string's name. A component whose tables live in another database overrides it.
    public virtual string ConnectionKey => "default";

    protected Response<JsonNode> Run(IParameters parameters, JsonNode data, bool isCommand)
    {
        var response = new Response<JsonNode>();
        if (!Prepare(parameters, response, out var initialize, out var connectionString)) return response;
        try
        {
            using var connection = new SqlConnection(connectionString);
            connection.Open();
            using var command = connection.CreateCommand();
            initialize(new SqlCommandContext(command), parameters, data);
            var text = command.CommandText.ToUpperInvariant();
            if (text.Contains("FOR JSON"))
            {
                using var reader = command.ExecuteReader();
                var json = new StringBuilder();
                while (reader.Read()) if (!reader.IsDBNull(0)) json.Append(reader.GetString(0));
                AddJson(response, json.ToString(), isCommand);
            }
            else if (!isCommand || text.Contains("OUTPUT") || text.Contains("SCOPE_IDENTITY"))
            {
                using var reader = command.ExecuteReader();
                while (reader.Read()) response.Items.Add(Row(reader));
            }
            else
            {
                var affected = command.ExecuteNonQuery();
                response.Status.Affected = affected;
                response.Model = new JsonObject { ["isOkay"] = true, ["rowsAffected"] = affected };
            }
        }
        catch (SqlException ex)
        {
            Refused(response, ex, parameters);
        }
        return response;
    }

    protected async Task<Response<JsonNode>> RunAsync(IParameters parameters, JsonNode data, bool isCommand)
    {
        var response = new Response<JsonNode>();
        if (!Prepare(parameters, response, out var initialize, out var connectionString)) return response;
        try
        {
            await using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            initialize(new SqlCommandContext(command), parameters, data);
            var text = command.CommandText.ToUpperInvariant();
            if (text.Contains("FOR JSON"))
            {
                await using var reader = await command.ExecuteReaderAsync();
                var json = new StringBuilder();
                while (await reader.ReadAsync()) if (!await reader.IsDBNullAsync(0)) json.Append(reader.GetString(0));
                AddJson(response, json.ToString(), isCommand);
            }
            else if (!isCommand || text.Contains("OUTPUT") || text.Contains("SCOPE_IDENTITY"))
            {
                await using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync()) response.Items.Add(Row(reader));
            }
            else
            {
                var affected = await command.ExecuteNonQueryAsync();
                response.Status.Affected = affected;
                response.Model = new JsonObject { ["isOkay"] = true, ["rowsAffected"] = affected };
            }
        }
        catch (SqlException ex)
        {
            Refused(response, ex, parameters);
        }
        return response;
    }

    private bool Prepare(IParameters parameters, Response<JsonNode> response, out CommandInitializer initialize, out string connectionString)
    {
        initialize = null;
        connectionString = _configuration.GetConnectionString(ConnectionKey);
        if (!parameters.TryParseQueryCommand(out var key))
        {
            response.Status.HttpCode = 400;
            response.Status.Message = "No command key (domain.name.action).";
            return false;
        }
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            response.Status.HttpCode = 503;
            response.Status.Message = $"No connection string '{ConnectionKey}'.";
            return false;
        }
        initialize = InitializerLocator.GetInitializer(key.Domain, key.Discriminator);
        response.Action = key.Key;
        return true;
    }

    private static void AddJson(Response<JsonNode> response, string json, bool isCommand)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            if (isCommand) response.Model = new JsonObject { ["isOkay"] = true };
            return;
        }
        var node = JsonNode.Parse(json);
        if (node is JsonArray array)
        {
            foreach (var item in array) response.Items.Add(item?.DeepClone().ToCamelCase());
        }
        else
        {
            response.Model = node.ToCamelCase();
        }
    }

    private static JsonObject Row(DbDataReader reader)
    {
        var row = new JsonObject();
        for (var i = 0; i < reader.FieldCount; i++)
        {
            row[System.Text.Json.JsonNamingPolicy.CamelCase.ConvertName(reader.GetName(i))] =
                reader.IsDBNull(i) ? null : JsonValue.Create(reader.GetValue(i));
        }
        return row;
    }

    // A script's own refusals carry their meaning in the error number; anything else is the server's fault.
    private void Refused(Response response, SqlException ex, IParameters parameters)
    {
        response.Status.Message = ex.Message;
        response.Status.HttpCode = ex.Number switch
        {
            50400 => 400,
            50404 => 404,
            50409 => 409,
            2601 or 2627 or 547 => 409,
            _ => 500,
        };
        if (ex.Number is 2601 or 2627) response.Status.Message = "The change conflicts with an existing record. Reload and try again.";
        if (ex.Number == 547) response.Status.Message = "Another record still refers to this one, so it cannot change this way.";
        if (response.Status.HttpCode == 500)
        {
            response.Status.Message = "The database could not complete the request.";
            response.Status.SystemMessage = ex.Message;
            Logger.LogError(ex, "Command/query {Key} failed", parameters.TryGet("key", out string key) ? key : "?");
        }
    }
}

public class JsonQueryHandler(IInitializerLocator initializerLocator, ILogger<JsonQueryHandler> logger, IConfiguration configuration)
    : JsonHandler(initializerLocator, logger, configuration), IJsonQueryHandler
{
    public Response<JsonNode> Query(IParameters parameters) => Run(parameters, null, isCommand: false);

    public Task<Response<JsonNode>> QueryAsync(IParameters parameters) => RunAsync(parameters, null, isCommand: false);
}

public class JsonCommandHandler(IInitializerLocator initializerLocator, ILogger<JsonCommandHandler> logger, IConfiguration configuration)
    : JsonHandler(initializerLocator, logger, configuration), IJsonCommandHandler
{
    public Response<JsonNode> Execute(IParameters parameters, JsonNode data) => Run(parameters, data, isCommand: true);

    public Task<Response<JsonNode>> ExecuteAsync(IParameters parameters, JsonNode data) => RunAsync(parameters, data, isCommand: true);
}
