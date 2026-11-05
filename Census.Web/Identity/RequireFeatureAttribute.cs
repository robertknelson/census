using System;
using System.Threading.Tasks;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;

namespace Census.Web.Identity;

// The server's half of a feature the persona UX offers (security: controls on the UX and the server). The member acted
// as must hold the feature on some application, the same union the nav trims by (MemberAccess.Features); a system
// administrator signed in as themselves passes. Anyone else gets 403.
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequireFeatureAttribute(string feature) : Attribute, IAsyncActionFilter
{
    public string Feature { get; } = feature;

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var user = context.HttpContext.User;
        if (!(user.CanAdminister() && !user.IsImpersonating()))
        {
            var members = context.HttpContext.RequestServices.GetRequiredService<MemberAccess>();
            var access = members.Enabled ? await members.AccessAsync(user.Effective()) : null;
            if (access == null || !access.Features.Contains(Feature))
            {
                context.Result = new ObjectResult(new { message = $"This needs {Feature}, which {user.Effective()} does not hold." }) { StatusCode = 403 };
                return;
            }
        }
        await next();
    }
}
