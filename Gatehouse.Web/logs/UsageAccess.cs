using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using Gatehouse.CommandQuery;
using Gatehouse.Identity;
using Gatehouse.Logs.Data;
using Microsoft.Extensions.Options;

namespace Gatehouse.Logs;

// Who may see which application in Usage, and whose requests are left out (gatehouse.md §13, U-R1 and U-R3). The server
// decides both; the pages are told the answer.
public class UsageAccess(IJsonQueryHandler queries, IOptions<UsageOptions> usage)
{
    public record Held(string Name, string Identifier);

    // Null: every application (a system administrator). Otherwise the registry applications the member holds a role on.
    public async Task<List<Held>> ScopeAsync(ClaimsPrincipal user)
    {
        if (user.IsInRole(ClaimsTransformer.SystemAdministrator)) return null;
        var identifier = user.FindFirst(ClaimsTransformer.IdentifierClaim)?.Value;
        var response = await queries.QueryAsync(new Parameters().CommandQuery(LogsSqlCommandInitializer.Name, "usage-scope").AddParam("Identifier", identifier ?? ""));
        return response.Items.Select(r => new Held((string)r["name"], (string)r["identifier"])).ToList();
    }

    // A log row's Application belongs to a held application when it is its name or its identifier, ignoring case (U9).
    public static bool InScope(List<Held> scope, string application) =>
        scope == null || scope.Any(h => string.Equals(h.Name, application, StringComparison.OrdinalIgnoreCase)
                                        || string.Equals(h.Identifier, application, StringComparison.OrdinalIgnoreCase));

    // The identifiers left out for one application (those for "*" and its own), or for every application at once.
    public List<string> ExcludedFor(string application) =>
        usage.Value.Excluded.Where(e => e.Key == "*" || string.Equals(e.Key, application, StringComparison.OrdinalIgnoreCase))
            .SelectMany(e => e.Value ?? Array.Empty<string>()).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(i => i).ToList();

    // What the scripts take as @Excluded: [{ application, identifier }], "*" meaning every application.
    public string ExcludedJson() =>
        JsonSerializer.Serialize(usage.Value.Excluded.SelectMany(e => (e.Value ?? Array.Empty<string>()).Select(i => new { application = e.Key, identifier = i })));

    public Dictionary<string, string[]> Excluded => usage.Value.Excluded;
}
