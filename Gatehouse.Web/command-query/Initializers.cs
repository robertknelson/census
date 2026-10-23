using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Data.SqlClient;

namespace Gatehouse.CommandQuery;

public class SqlCommandContext : ICommandContext
{
    public SqlCommand Command { get; }
    public SqlCommandContext(SqlCommand command) => Command = command;
}

// A component's initializers: subclasses add key → delegate in their constructor.
public class SqlCommandInitializer : ISqlCommandInitializer
{
    public const string DomainName = "gatehouse";
    protected string Domain => DomainName;
    protected Dictionary<string, Action<SqlCommand, IParameters, JsonNode>> Initializers { get; } = new(StringComparer.OrdinalIgnoreCase);
    string ISqlCommandInitializer.Domain => Domain;
    Dictionary<string, Action<SqlCommand, IParameters, JsonNode>> ISqlCommandInitializer.Initializers => Initializers;
}

// Every registered component's initializers, found by "domain.name.action".
public class SqlCommandInitializerContainer : IInitializerLocator
{
    private readonly Dictionary<string, CommandInitializer> _initializers = new(StringComparer.OrdinalIgnoreCase);

    public SqlCommandInitializerContainer(IEnumerable<ISqlCommandInitializer> initializers)
    {
        foreach (var component in initializers)
        {
            foreach (var (key, initialize) in component.Initializers)
            {
                if (_initializers.ContainsKey(key)) throw new InvalidOperationException($"Two initializers claim the key '{key}'.");
                _initializers[key] = (context, parameters, data) =>
                    initialize((context as SqlCommandContext ?? throw new ArgumentException("Invalid command context type.")).Command, parameters, data);
            }
        }
    }

    public CommandInitializer GetInitializer(string domainName, string commandName) =>
        _initializers.TryGetValue($"{domainName}.{commandName}", out var initializer)
            ? initializer
            : throw new KeyNotFoundException($"No CommandInitializer found for domain '{domainName}' and command '{commandName}'.");
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
    // Sets the dispatch key: parameters.CommandQuery("feature", "list") → "gatehouse.feature.list".
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
