using System;
using System.Collections.Concurrent;
using System.Data.Common;
using System.IO;
using System.Text;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Census.Web.CommandQuery;

// Gatehouse's JsonQueryHandler and JsonCommandHandler (census-on-apptrak.md §3), which are xf-dashboard's with its open
// items fixed (real async, rows kept, a long FOR JSON read whole, refusals as status codes). Different from Gatehouse:
//   * the result shape is the key's declared one (Rows, Json, Scalar), never guessed from the script's text;
//   * a row keeps each column's name as the script wrote it, so an API answers as it did before the move;
//   * a Json answer is the document text as SQL Server wrote it (Model is a string JsonValue), served byte for byte;
//   * THROW 50410 (the record's state forbids it) is a 409 too (Potemkin sql-refusal-to-http-status);
//   * the connection string is a section's ConnectionString ("MoveIt" for AppTrak, "Logs" for the log tables);
//   * a command handler can run several keys in one transaction (Move It's entry writes).
public abstract class JsonHandler
{
    protected readonly IConfiguration Configuration;
    protected readonly ILogger Logger;
    protected readonly IInitializerLocator InitializerLocator;

    protected JsonHandler(IInitializerLocator initializerLocator, ILogger logger, IConfiguration configuration)
    {
        InitializerLocator = initializerLocator;
        Logger = logger;
        Configuration = configuration;
    }

    // The settings section whose ConnectionString this handler uses. The log readers' handlers override it.
    public virtual string ConnectionSection => "MoveIt";

    public string ConnectionString => Configuration[$"{ConnectionSection}:ConnectionString"];

    public bool Enabled => !string.IsNullOrWhiteSpace(ConnectionString);

    protected async Task<Response<JsonNode>> RunAsync(IParameters parameters, JsonNode data, SqlConnection shared = null, SqlTransaction tx = null)
    {
        var response = new Response<JsonNode>();
        if (!parameters.TryParseQueryCommand(out var key))
        {
            response.Status.HttpCode = 400;
            response.Status.Message = "No command key (domain.name.action).";
            return response;
        }
        if (shared == null && !Enabled)
        {
            response.Status.HttpCode = 503;
            response.Status.Message = $"No connection string in '{ConnectionSection}'.";
            return response;
        }
        var initialize = InitializerLocator.GetInitializer(key.Domain, key.Discriminator);
        var shape = InitializerLocator.GetShape(key.Domain, key.Discriminator);
        response.Action = key.Key;
        SqlConnection owned = null;
        try
        {
            var connection = shared;
            if (connection == null)
            {
                owned = new SqlConnection(ConnectionString);
                await owned.OpenAsync();
                connection = owned;
            }
            await using var command = connection.CreateCommand();
            command.Transaction = tx;
            initialize(new SqlCommandContext(command), parameters, data);
            await using var reader = await command.ExecuteReaderAsync();
            switch (shape)
            {
                case ResultShape.Json:
                    var json = new StringBuilder();
                    while (await reader.ReadAsync()) if (!await reader.IsDBNullAsync(0)) json.Append(reader.GetString(0));
                    if (json.Length > 0) response.Model = JsonValue.Create(json.ToString());
                    break;
                case ResultShape.Scalar:
                    if (await reader.ReadAsync()) response.Model = reader.IsDBNull(0) ? null : JsonValue.Create(reader.GetValue(0));
                    break;
                default:
                    while (await reader.ReadAsync()) response.Items.Add(Row(reader));
                    break;
            }
        }
        catch (SqlException ex)
        {
            Refused(response, ex, key.Key);
            if (tx != null) throw new CommandRefusedException(response);
        }
        finally
        {
            if (owned != null) await owned.DisposeAsync();
        }
        return response;
    }

    private static JsonObject Row(DbDataReader reader)
    {
        var row = new JsonObject();
        for (var i = 0; i < reader.FieldCount; i++)
        {
            row[reader.GetName(i)] = reader.IsDBNull(i) ? null : JsonValue.Create(reader.GetValue(i));
        }
        return row;
    }

    // A script's own refusals carry their meaning in the error number; anything else is the server's fault.
    private void Refused(Response response, SqlException ex, string key)
    {
        response.Status.Message = ex.Message;
        response.Status.HttpCode = ex.Number switch
        {
            50400 => 400,
            50404 => 404,
            50409 or 50410 => 409,
            2601 or 2627 or 547 => 409,
            _ => 500,
        };
        if (ex.Number is 2601 or 2627) response.Status.Message = "The change conflicts with an existing record. Reload and try again.";
        if (ex.Number == 547) response.Status.Message = "Another record still refers to this one, so it cannot change this way.";
        if (response.Status.HttpCode == 500)
        {
            response.Status.Message = "The database could not complete the request.";
            response.Status.SystemMessage = ex.Message;
            Logger.LogError(ex, "Command/query {Key} failed", key);
        }
    }
}

// Thrown inside a transaction so the whole of it rolls back; carries the refused step's response.
public class CommandRefusedException(Response<JsonNode> response) : Exception(response.Status.Message)
{
    public Response<JsonNode> Response { get; } = response;
}

// Several keys on one connection and one transaction: committed when the work returns, rolled back if any step throws.
public interface ICommandBatch
{
    Task<Response<JsonNode>> ExecuteAsync(IParameters parameters, JsonNode data = null);
}

public class JsonQueryHandler(IInitializerLocator initializerLocator, ILogger<JsonQueryHandler> logger, IConfiguration configuration)
    : JsonHandler(initializerLocator, logger, configuration), IJsonQueryHandler
{
    public Response<JsonNode> Query(IParameters parameters) => RunAsync(parameters, null).GetAwaiter().GetResult();

    public Task<Response<JsonNode>> QueryAsync(IParameters parameters) => RunAsync(parameters, null);
}

public class JsonCommandHandler(IInitializerLocator initializerLocator, ILogger<JsonCommandHandler> logger, IConfiguration configuration)
    : JsonHandler(initializerLocator, logger, configuration), IJsonCommandHandler
{
    public Response<JsonNode> Execute(IParameters parameters, JsonNode data) => RunAsync(parameters, data).GetAwaiter().GetResult();

    public Task<Response<JsonNode>> ExecuteAsync(IParameters parameters, JsonNode data) => RunAsync(parameters, data);

    public async Task<T> TransactionAsync<T>(Func<ICommandBatch, Task<T>> work)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var tx = connection.BeginTransaction();
        var result = await work(new Batch(this, connection, tx));
        await tx.CommitAsync();
        return result;
    }

    private sealed class Batch(JsonCommandHandler handler, SqlConnection connection, SqlTransaction tx) : ICommandBatch
    {
        public Task<Response<JsonNode>> ExecuteAsync(IParameters parameters, JsonNode data = null) =>
            handler.RunAsync(parameters, data, connection, tx);
    }
}

// The log tables' reads: the same, on the Logs connection (falling back to AppTrak's, as the readers did).
public class LogsQueryHandler(IInitializerLocator initializerLocator, ILogger<LogsQueryHandler> logger, IConfiguration configuration)
    : JsonHandler(initializerLocator, logger, configuration), IJsonQueryHandler
{
    public override string ConnectionSection => string.IsNullOrWhiteSpace(Configuration["Logs:ConnectionString"]) ? "MoveIt" : "Logs";

    public Response<JsonNode> Query(IParameters parameters) => RunAsync(parameters, null).GetAwaiter().GetResult();

    public Task<Response<JsonNode>> QueryAsync(IParameters parameters) => RunAsync(parameters, null);
}

// Scripts are read from apptrak/sql (MoveIt:SqlPath), where sqlcmd's setup runs them too. Kept once read, except in
// Development, where an edited script takes effect on the next call, as it did before the move.
public static class SqlScripts
{
    private static readonly ConcurrentDictionary<string, string> Loaded = new();
    private static string _root;
    private static bool _keep = true;

    public static void Configure(string root, bool keep)
    {
        _root = root;
        _keep = keep;
    }

    public static string Load(string file) => _keep ? Loaded.GetOrAdd(file, Read) : Read(file);

    private static string Read(string file)
    {
        var path = Path.Combine(_root ?? throw new InvalidOperationException("SqlScripts is not configured."), file);
        return File.Exists(path) ? File.ReadAllText(path) : throw new FileNotFoundException($"No script '{file}' under {_root}.", path);
    }
}
