using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Gatehouse.CommandQuery;
using Gatehouse.FeatureManagement.Data;
using Gatehouse.FeatureManagement.Evaluation;
using Gatehouse.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.FeatureManagement;
using Microsoft.FeatureManagement.FeatureFilters;

namespace Gatehouse.FeatureManagement;

public class FeatureAccessOptions
{
    public const string SectionName = "FeatureAccess";

    public TimeSpan DefinitionCacheDuration { get; set; } = TimeSpan.FromSeconds(60);

    // The role that may use the Feature Access page: a fixed policy, never a feature (FM2280 D7, gatehouse.md §6).
    public string AdminRole { get; set; } = "system-administrator";
}

public static class FeatureAccessPolicies
{
    // The way back: the admin page and API. A role, so a feature switched off cannot lock everyone out.
    public const string Admin = "FeatureAccessAdmin";

    // Anyone signed in: pages that need no feature (Home).
    public const string SignedIn = "SignedIn";

    // Signed in and not a member: the welcome and the request to join (gatehouse.md §11.5). Fixed, never a feature, so
    // a newcomer always has a way in.
    public const string Visitor = "Visitor";
}

// The roles a feature may be granted to: AppTrak's member-types list (core.SelectItem), the same identifiers
// membership.MemberApplicationRole holds (G-R4).
public interface IRoleCatalog
{
    Task<IReadOnlyList<string>> GetRoleNamesAsync();
}

public class MemberTypesRoleCatalog(IJsonQueryHandler queries) : IRoleCatalog
{
    public async Task<IReadOnlyList<string>> GetRoleNamesAsync()
    {
        var parameters = new Parameters();
        parameters.CommandQuery(FeatureSqlCommandInitializer.Name, "roles");
        var response = await queries.QueryAsync(parameters);
        return response.Items.Select(r => (string)r["identifier"]).ToList();
    }
}

public static class FeatureManagementSetup
{
    public static IServiceCollection AddGatehouseFeatureManagement(this IServiceCollection services, string adminRole)
    {
        services.AddHttpContextAccessor();
        services.AddMemoryCache();
        services.Configure<TargetingEvaluationOptions>(targeting => targeting.IgnoreCase = true);
        services.AddFeatureManagement()
            .WithTargeting<ClaimsTargetingContextAccessor>()
            .UseDisabledFeaturesHandler(new ForbidDisabledFeaturesHandler());
        // After AddFeatureManagement, so the SQL definitions win over the configuration provider.
        services.AddSingleton<FeatureDefinitionStore>();
        services.AddSingleton<IFeatureDefinitionProvider, SqlFeatureDefinitionProvider>();
        services.AddSingleton<FeatureGateScanner>();
        services.AddTransient<ISqlCommandInitializer, FeatureSqlCommandInitializer>();
        services.AddScoped<FeatureQueryHandler>();
        services.AddScoped<FeatureCommandHandler>();
        services.AddScoped<IRoleCatalog, MemberTypesRoleCatalog>();
        services.AddScoped<NavigationFilter>();
        services.AddAuthorizationBuilder()
            .AddPolicy(FeatureAccessPolicies.Admin, policy => policy.RequireRole(adminRole))
            .AddPolicy(FeatureAccessPolicies.SignedIn, policy => policy.RequireAuthenticatedUser())
            .AddPolicy(FeatureAccessPolicies.Visitor, policy => policy.RequireAuthenticatedUser().RequireClaim(ClaimsTransformer.MemberClaim, "false"));
        return services;
    }
}
