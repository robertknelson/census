using System.Collections.Concurrent;
using System.IO;

namespace Census.Web.FeatureAccess.Data
{
    internal static class SqlScripts
    {
        public const string FeatureDefinitions = "feature-definitions.sql";

        public const string FeatureCreate = "feature-create.sql";
        public const string FeatureUpdate = "feature-update.sql";
        public const string FeatureSetEnabled = "feature-set-enabled.sql";
        public const string FeatureVoid = "feature-void.sql";
        public const string RoleGrant = "role-grant.sql";
        public const string RoleRevoke = "role-revoke.sql";

        public const string FeatureList = "feature-list.sql";
        public const string FeatureGet = "feature-get.sql";
        public const string FeatureAudit = "feature-audit.sql";

        private static readonly ConcurrentDictionary<string, string> _scripts = new();

        // Census: the scripts are files under apptrak/sql/fm, beside AppTrak's other SQL, not
        // embedded resources (FM2280's way). Set once at registration.
        public static string Directory { get; set; }

        public static string Load(string name) => _scripts.GetOrAdd(name, key => File.ReadAllText(Path.Combine(Directory, key)));
    }
}
