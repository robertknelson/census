using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Census.Web.FeatureAccess;

namespace Census.Web.Services;

// The roles the feature access page offers (personas.md §6.1): AppTrak's member-types list.
public class MemberTypesRoleCatalog(MoveItQuestions questions) : IRoleCatalog
{
    public async Task<IReadOnlyList<string>> GetRoleNamesAsync() =>
        (await questions.RunAsync("fm/roles.sql")).Select(r => (string)r["Identifier"]).ToList();
}
