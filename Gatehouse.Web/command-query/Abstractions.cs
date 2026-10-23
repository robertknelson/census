using System.Collections.Generic;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;

namespace Gatehouse.CommandQuery;

// xf-dashboard's command/query contracts (.xf/.common/jnode), with their signatures kept so code written against
// them ports to an app that has its own copy (gatehouse.md §4). Only the namespace is Gatehouse's.

public interface IParameters : IDictionary<string, object>
{
    bool TryGet<T>(string key, out T value);
    IParameters AddParam(string key, object value);
}

public interface IJsonQueryHandler
{
    Response<JsonNode> Query(IParameters parameters);
    Task<Response<JsonNode>> QueryAsync(IParameters parameters);
}

public interface IJsonCommandHandler
{
    Response<JsonNode> Execute(IParameters parameters, JsonNode data);
    Task<Response<JsonNode>> ExecuteAsync(IParameters parameters, JsonNode data);
}

public interface ICommandContext
{
}

public delegate void CommandInitializer(ICommandContext context, IParameters parameters, JsonNode data = null);

public interface IInitializerLocator
{
    CommandInitializer GetInitializer(string domainName, string commandName);
}

// One per component: a dictionary of key ("gatehouse.feature.list") to the delegate that readies its SqlCommand.
public interface ISqlCommandInitializer
{
    string Domain { get; }
    Dictionary<string, System.Action<SqlCommand, IParameters, JsonNode>> Initializers { get; }
}
