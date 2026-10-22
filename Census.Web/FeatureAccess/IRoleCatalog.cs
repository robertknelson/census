using System.Collections.Generic;
using System.Threading.Tasks;

namespace Census.Web.FeatureAccess
{
    // Implemented by the host: the role names a feature may be granted to.
    public interface IRoleCatalog
    {
        Task<IReadOnlyList<string>> GetRoleNamesAsync();
    }
}
