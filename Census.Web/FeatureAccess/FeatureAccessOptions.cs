using Microsoft.AspNetCore.Authorization;
using System;

namespace Census.Web.FeatureAccess
{
    public class FeatureAccessOptions
    {
        public string ConnectionString { get; set; }

        // Census: where the fm scripts are (apptrak/sql/fm).
        public string SqlDirectory { get; set; }

        public TimeSpan DefinitionCacheDuration { get; set; } = TimeSpan.FromSeconds(60);

        // Required. Guards the admin API; a fixed policy, never a feature (spec D7).
        public Action<AuthorizationPolicyBuilder> ConfigureAdminPolicy { get; set; }
    }
}
