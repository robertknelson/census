using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Gatehouse.CommandQuery;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace Gatehouse.Identity;

public interface IAuthProvider
{
    Task ResolveAsync(UserSession session);
}

public class IdentityOptions
{
    public const string SectionName = "Identity";

    // A resolved user is kept this long, so a grant made on the Membership page reaches its holder within minutes.
    public int SessionMinutes { get; set; } = 5;

    // The membership.Application whose roles count here (gatehouse.md §5).
    public string Application { get; set; } = "gatehouse";
}

// The person and their roles on this application, from AppTrak's membership (gatehouse.md §5): the member by
// Identifier = the Windows username, and every member-types identifier they hold on Identity:Application.
public class MembershipAuthProvider(IJsonQueryHandler queries, IOptions<IdentityOptions> options) : IAuthProvider
{
    public async Task ResolveAsync(UserSession session)
    {
        var parameters = new Parameters();
        parameters.CommandQuery("identity", "member");
        parameters.AddParam("identifier", session.UserName);
        parameters.AddParam("application", options.Value.Application);
        var response = await queries.QueryAsync(parameters);
        if (!response.IsOkay || response.Model is not JsonObject member) return;
        session.IsMember = true;
        session.FirstName = (string)member["firstName"];
        session.LastName = (string)member["lastName"];
        session.Roles = (member["roles"] as JsonArray ?? new JsonArray()).Select(r => (string)r).Where(r => r != null).ToList();
    }
}

public class IdentitySqlCommandInitializer : SqlCommandInitializer
{
    public IdentitySqlCommandInitializer()
    {
        Initializers.Add($"{Domain}.identity.member", InitializeMember);
    }

    private static void InitializeMember(SqlCommand command, IParameters parameters, JsonNode node)
    {
        command.CommandType = CommandType.Text;
        command.CommandText = SqlScript.Load("identity/sql/member-roles.sql");
        command.Parameters.Add(new SqlParameter("@Identifier", SqlDbType.NVarChar, 100) { Value = parameters.TryGet("identifier", out string identifier) ? identifier : "" });
        command.Parameters.Add(new SqlParameter("@Application", SqlDbType.NVarChar, 100) { Value = parameters.TryGet("application", out string application) ? application : "" });
    }
}
