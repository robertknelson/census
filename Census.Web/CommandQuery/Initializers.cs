using System;
using System.Collections.Generic;
using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Data.SqlClient;

namespace Census.Web.CommandQuery;

public class SqlCommandContext : ICommandContext
{
    public SqlCommand Command { get; }
    public SqlCommandContext(SqlCommand command) => Command = command;
}

// A component's initializers: subclasses add key → delegate in their constructor (census-on-apptrak.md §3). Most
// Census scripts need only binding, so Script() declares one: its key, its file under apptrak/sql, the shape it
// answers, and the parameters it takes by name and type, read from IParameters (absent → NULL). A write names
// Actor and ImpersonatedBy among them (§10.3).
public class SqlCommandInitializer : ISqlCommandInitializer
{
    public const string DomainName = "census";
    protected string Domain => DomainName;
    protected Dictionary<string, Action<SqlCommand, IParameters, JsonNode>> Initializers { get; } = new(StringComparer.OrdinalIgnoreCase);
    protected Dictionary<string, ResultShape> Shapes { get; } = new(StringComparer.OrdinalIgnoreCase);
    string ISqlCommandInitializer.Domain => Domain;
    Dictionary<string, Action<SqlCommand, IParameters, JsonNode>> ISqlCommandInitializer.Initializers => Initializers;
    Dictionary<string, ResultShape> ISqlCommandInitializer.Shapes => Shapes;

    protected void Script(string nameAction, string file, ResultShape shape, params (string Name, SqlDbType Type)[] parameters)
    {
        var key = $"{Domain}.{nameAction}";
        foreach (var (name, _) in parameters)
        {
            // The bag's "key" is the dispatch key, and its names ignore case: a script parameter @Key would overwrite it.
            if (string.Equals(name, "key", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException($"{key}: a script parameter cannot be named @Key.");
        }
        Shapes[key] = shape;
        Initializers[key] = (command, values, _) =>
        {
            command.CommandType = CommandType.Text;
            command.CommandText = SqlScripts.Load(file);
            foreach (var (name, type) in parameters)
            {
                var p = command.Parameters.Add("@" + name, type);
                if (type is SqlDbType.NVarChar or SqlDbType.VarChar) p.Size = -1;
                p.Value = values.TryGetValue(name, out var value) && value != null ? value : DBNull.Value;
            }
        };
    }
}

// Every registered component's initializers, found by "domain.name.action".
public class SqlCommandInitializerContainer : IInitializerLocator
{
    private readonly Dictionary<string, CommandInitializer> _initializers = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, ResultShape> _shapes = new(StringComparer.OrdinalIgnoreCase);

    public SqlCommandInitializerContainer(IEnumerable<ISqlCommandInitializer> initializers)
    {
        foreach (var component in initializers)
        {
            foreach (var (key, initialize) in component.Initializers)
            {
                if (_initializers.ContainsKey(key)) throw new InvalidOperationException($"Two initializers claim the key '{key}'.");
                _initializers[key] = (context, parameters, data) =>
                    initialize((context as SqlCommandContext ?? throw new ArgumentException("Invalid command context type.")).Command, parameters, data);
                _shapes[key] = component.Shapes.TryGetValue(key, out var shape)
                    ? shape
                    : throw new InvalidOperationException($"The key '{key}' declares no result shape.");
            }
        }
    }

    public CommandInitializer GetInitializer(string domainName, string commandName) =>
        _initializers.TryGetValue($"{domainName}.{commandName}", out var initializer)
            ? initializer
            : throw new KeyNotFoundException($"No CommandInitializer found for domain '{domainName}' and command '{commandName}'.");

    public ResultShape GetShape(string domainName, string commandName) => _shapes[$"{domainName}.{commandName}"];
}

public class QueryCommand
{
    public string Key { get; set; }
    public string Domain { get; set; }
    public string Name { get; set; }
    public string Action { get; set; }
    public string Discriminator => $"{Name}.{Action}";
}

public static class CommandQueryExtensions
{
    // Sets the dispatch key: parameters.CommandQuery("board", "releases") → "census.board.releases".
    public static IParameters CommandQuery(this IParameters parameters, string name, string action) =>
        parameters.AddParam("key", $"{SqlCommandInitializer.DomainName}.{name}.{action}");

    public static bool TryParseQueryCommand(this IParameters parameters, out QueryCommand command)
    {
        command = null;
        if (!parameters.TryGet("key", out string key)) return false;
        var parts = key.Split('.');
        if (parts.Length != 3) return false;
        command = new QueryCommand { Key = key, Domain = parts[0], Name = parts[1], Action = parts[2] };
        return true;
    }

    public static JsonNode ToCamelCase(this JsonNode node)
    {
        if (node is JsonObject obj)
        {
            foreach (var (name, value) in new List<KeyValuePair<string, JsonNode>>(obj))
            {
                var camel = JsonNamingPolicy.CamelCase.ConvertName(name);
                if (camel != name)
                {
                    obj.Remove(name);
                    obj[camel] = value;
                }
                value?.ToCamelCase();
            }
        }
        else if (node is JsonArray array)
        {
            foreach (var item in array) item?.ToCamelCase();
        }
        return node;
    }
}
