using Microsoft.AspNetCore.Http;
using Microsoft.FeatureManagement.FeatureFilters;
using System.Linq;
using System.Threading.Tasks;

namespace Census.Web.FeatureAccess.Evaluation
{
    public class ClaimsTargetingContextAccessor : ITargetingContextAccessor
    {
        private readonly IHttpContextAccessor _httpContextAccessor;

        public ClaimsTargetingContextAccessor(IHttpContextAccessor httpContextAccessor)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        public ValueTask<TargetingContext> GetContextAsync()
        {
            var user = _httpContextAccessor.HttpContext?.User;
            var context = new TargetingContext
            {
                UserId = user?.Identity?.Name,
                Groups = user?.Identities
                    .SelectMany(identity => identity.FindAll(identity.RoleClaimType))
                    .Select(claim => claim.Value)
                    .Distinct()
                    .ToList()
                    ?? Enumerable.Empty<string>()
            };
            return new ValueTask<TargetingContext>(context);
        }
    }
}
