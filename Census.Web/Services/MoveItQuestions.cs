using System.Collections.Generic;
using System.Threading.Tasks;
using Census.Web.CommandQuery;

namespace Census.Web.Services;

// Runs one of the Move It question files verbatim (move-it.md §10.2 rule 9: one read-only
// .sql per question, the board reads them), by its command/query key (census-on-apptrak.md §3).
// Rows come back as column-name → value so a new column in a file reaches the page unchanged.
public class MoveItQuestions(JsonQueryHandler queries)
{
    public bool Enabled => queries.Enabled;

    public async Task<List<Dictionary<string, object>>> RunAsync(string key) =>
        (await queries.QueryAsync(ResponseExtensions.Key(key))).Rows();

    // A question that ends FOR JSON PATH (13) comes back as one document, read whole. An empty
    // result is an empty array, never an empty body.
    public async Task<string> RunJsonAsync(string key) =>
        (await queries.QueryAsync(ResponseExtensions.Key(key))).Json() ?? "[]";
}
