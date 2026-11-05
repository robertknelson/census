using System.Collections.Generic;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;

namespace Census.Web.CommandQuery;

// xf-dashboard's command/query contracts (.xf/.common/jnode), as Gatehouse ported them (census-on-apptrak.md §3): the
// signatures kept so code written here ports to an app that has its own copy. IInitializerLocator adds GetShape.

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

    // What the script answers, declared with its key, never guessed from its text (Potemkin sql-script-loader:
    // Gatehouse's search for FOR JSON or OUTPUT misreads a script that only mentions them, as the reset's does).
    ResultShape GetShape(string domainName, string commandName);
}

public enum ResultShape
{
    Rows,    // every row, each column under its own name, as written in the script
    Json,    // one FOR JSON document, read whole however SQL Server splits it
    Scalar,  // the first column of the first row: a write's key or outcome
}

// One per component: a dictionary of key ("census.board.releases") to the delegate that readies its SqlCommand, and the
// shape each key's script answers.
public interface ISqlCommandInitializer
{
    string Domain { get; }
    Dictionary<string, System.Action<SqlCommand, IParameters, JsonNode>> Initializers { get; }
    Dictionary<string, ResultShape> Shapes { get; }
}
