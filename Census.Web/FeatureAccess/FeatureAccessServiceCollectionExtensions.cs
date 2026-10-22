using Census.Web.FeatureAccess.Data;
using Census.Web.FeatureAccess.Evaluation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.FeatureManagement;
using Microsoft.FeatureManagement.FeatureFilters;
using System;

namespace Census.Web.FeatureAccess
{
    public static class FeatureAccessServiceCollectionExtensions
    {
        // The host must also register an IRoleCatalog.
        public static IFeatureManagementBuilder AddFeatureAccess(this IServiceCollection services, Action<FeatureAccessOptions> configure)
        {
            var options = new FeatureAccessOptions();
            configure(options);
            if (options.ConfigureAdminPolicy == null)
            {
                throw new InvalidOperationException(
                    $"{nameof(FeatureAccessOptions)}.{nameof(FeatureAccessOptions.ConfigureAdminPolicy)} is required: the feature access admin API must be guarded by a fixed authorization policy.");
            }

            SqlScripts.Directory = options.SqlDirectory;
            services.Configure(configure);
            services.Configure<TargetingEvaluationOptions>(targeting => targeting.IgnoreCase = true);
            services.AddHttpContextAccessor();
            services.AddAuthorization(authorization => authorization.AddPolicy(FeatureAccessPolicies.Admin, options.ConfigureAdminPolicy));

            var builder = services.AddFeatureManagement()
                .WithTargeting<ClaimsTargetingContextAccessor>()
                .UseDisabledFeaturesHandler(new ForbidDisabledFeaturesHandler());

            // Registered after AddFeatureManagement so it wins over the configuration provider.
            services.AddSingleton<FeatureDefinitionStore>();
            services.AddSingleton<IFeatureDefinitionProvider, SqlFeatureDefinitionProvider>();

            services.AddScoped<FeatureCommandHandler>();
            services.AddScoped<FeatureQueryHandler>();
            services.AddSingleton<FeatureGateScanner>();
            // Census: only with a database. Without one (the Demo profile) the scan would throw at
            // startup, and an unhandled background exception stops the whole app.
            if (!string.IsNullOrWhiteSpace(options.ConnectionString)) services.AddHostedService<FeatureGateScanLogger>();

            return builder;
        }
    }
}
