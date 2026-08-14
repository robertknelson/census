using Census.Web.Models.Api;
using Census.Web.Models.Census;

namespace Census.Web.Services;

/// <summary>
/// Keyed comparison per collection (census-web.md §5) — reordering must never register as a
/// change, so every collection is compared by an explicit key, never by array index.
/// </summary>
public static class DiffEngine
{
    public static SnapshotDiffDto Compute(string machine, string fromDate, CensusEnvelope from, string toDate, CensusEnvelope to)
    {
        return new SnapshotDiffDto
        {
            Machine = machine,
            FromDate = fromDate,
            ToDate = toDate,
            ScalarChanges = DiffScalars(from, to),
            Sections =
            [
                DiffApps(from, to),
                DiffDotnetStrings("dotnetCoreRuntimes", from.Dotnet?.Data?.CoreRuntimes, to.Dotnet?.Data?.CoreRuntimes),
                DiffDotnetStrings("dotnetSdks", from.Dotnet?.Data?.Sdks, to.Dotnet?.Data?.Sdks),
                DiffCertificates(from, to),
                DiffDrives(from, to),
                DiffSqlInstances(from, to),
                DiffSqlDatabases(from, to),
                DiffSqlDatabaseFiles(from, to),
                DiffIisSites(from, to),
                DiffIisAppPools(from, to),
                DiffIisApplications(from, to),
                DiffIisDependencies(from, to),
                DiffRoles(from, to),
            ],
        };
    }

    private static List<DiffFieldChange> DiffScalars(CensusEnvelope from, CensusEnvelope to)
    {
        var changes = new List<DiffFieldChange>();

        var fromBuild = $"{from.Os?.Data?.CurrentBuild}.{from.Os?.Data?.Ubr}";
        var toBuild = $"{to.Os?.Data?.CurrentBuild}.{to.Os?.Data?.Ubr}";
        if (fromBuild != toBuild) changes.Add(new DiffFieldChange("os.build", fromBuild, toBuild));

        var fromReboot = from.Os?.Data?.PendingReboot ?? false;
        var toReboot = to.Os?.Data?.PendingReboot ?? false;
        if (fromReboot != toReboot) changes.Add(new DiffFieldChange("os.pendingReboot", fromReboot.ToString(), toReboot.ToString()));

        return changes;
    }

    private static DiffSection DiffApps(CensusEnvelope from, CensusEnvelope to)
    {
        var fromEntries = KeyedApps(from.Apps?.Data?.Entries ?? []);
        var toEntries = KeyedApps(to.Apps?.Data?.Entries ?? []);
        return DiffKeyed("apps", fromEntries, toEntries,
            label: e => $"{e.DisplayName} ({e.Architecture}, {e.Hive})",
            compare: (a, b) => a.DisplayVersion != b.DisplayVersion
                ? [new DiffFieldChange("displayVersion", a.DisplayVersion, b.DisplayVersion)]
                : []);
    }

    // AppKey is not unique on a real machine — SQL Server alone registers several HKLM
    // uninstall subkeys carrying the identical DisplayName/Architecture/Hive/Sid tuple, and
    // the collector does not capture the subkey name that tells them apart. Duplicates are
    // ordered by DisplayVersion and suffixed with an ordinal so the two snapshots pair up
    // positionally, keeping an upgrade a displayVersion change rather than a remove+add. The
    // ordinal is appended to every key, not just duplicates, so a singleton on one side still
    // pairs with the first of a duplicate group on the other.
    private static Dictionary<string, AppEntry> KeyedApps(List<AppEntry> entries) =>
        entries
            .GroupBy(AppKey)
            .SelectMany(g => g
                .OrderBy(e => e.DisplayVersion, StringComparer.Ordinal)
                .Select((e, i) => (Key: $"{g.Key}|{i}", Entry: e)))
            .ToDictionary(x => x.Key, x => x.Entry);

    private static string AppKey(AppEntry e) => $"{e.DisplayName}|{e.Architecture}|{e.Hive}|{e.Sid}";

    private static DiffSection DiffDotnetStrings(string name, List<string>? fromList, List<string>? toList)
    {
        var fromSet = new HashSet<string>(fromList ?? []);
        var toSet = new HashSet<string>(toList ?? []);
        return new DiffSection
        {
            Name = name,
            Added = toSet.Except(fromSet).Select(s => new DiffItem { Key = s, Label = s }).ToList(),
            Removed = fromSet.Except(toSet).Select(s => new DiffItem { Key = s, Label = s }).ToList(),
        };
    }

    private static DiffSection DiffCertificates(CensusEnvelope from, CensusEnvelope to)
    {
        var fromEntries = (from.Certificates?.Data?.Certificates ?? []).ToDictionary(c => c.Thumbprint);
        var toEntries = (to.Certificates?.Data?.Certificates ?? []).ToDictionary(c => c.Thumbprint);
        return DiffKeyed("certificates", fromEntries, toEntries,
            label: c => c.Subject ?? c.Thumbprint,
            compare: (_, _) => []); // same thumbprint never changes fields worth tracking; renewal shows as remove+add
    }

    private static DiffSection DiffDrives(CensusEnvelope from, CensusEnvelope to)
    {
        var fromEntries = (from.Drives?.Data?.Drives ?? []).Where(d => d.DriveLetter is not null).ToDictionary(d => d.DriveLetter!);
        var toEntries = (to.Drives?.Data?.Drives ?? []).Where(d => d.DriveLetter is not null).ToDictionary(d => d.DriveLetter!);
        return DiffKeyed("drives", fromEntries, toEntries,
            label: d => $"{d.DriveLetter}: {d.Label}",
            compare: (a, b) =>
            {
                var changes = new List<DiffFieldChange>();
                if (a.PercentFree != b.PercentFree) changes.Add(new DiffFieldChange("percentFree", a.PercentFree?.ToString("0.0"), b.PercentFree?.ToString("0.0")));
                if (a.HealthStatus != b.HealthStatus) changes.Add(new DiffFieldChange("healthStatus", a.HealthStatus, b.HealthStatus));
                return changes;
            });
    }

    private static DiffSection DiffSqlInstances(CensusEnvelope from, CensusEnvelope to)
    {
        var fromEntries = (from.SqlServer?.Data?.Instances ?? []).Where(i => i.InstanceName is not null).ToDictionary(i => i.InstanceName!);
        var toEntries = (to.SqlServer?.Data?.Instances ?? []).Where(i => i.InstanceName is not null).ToDictionary(i => i.InstanceName!);
        return DiffKeyed("sqlInstances", fromEntries, toEntries,
            label: i => i.InstanceName!,
            compare: (a, b) =>
            {
                var changes = new List<DiffFieldChange>();
                if (a.Edition != b.Edition) changes.Add(new DiffFieldChange("edition", a.Edition, b.Edition));
                if (a.PatchLevel != b.PatchLevel) changes.Add(new DiffFieldChange("patchLevel", a.PatchLevel, b.PatchLevel));
                if (a.ServiceState != b.ServiceState) changes.Add(new DiffFieldChange("serviceState", a.ServiceState, b.ServiceState));
                if (a.ServiceAccount != b.ServiceAccount) changes.Add(new DiffFieldChange("serviceAccount", a.ServiceAccount, b.ServiceAccount));
                if (a.ConnectedStatus != b.ConnectedStatus) changes.Add(new DiffFieldChange("connectedStatus", a.ConnectedStatus, b.ConnectedStatus));
                // The permission stamp exists because a rights change silently shrinks the
                // database list. Diffing it turns that silent shrink into an event.
                if (a.Permissions?.ViewAnyDefinition != b.Permissions?.ViewAnyDefinition)
                    changes.Add(new DiffFieldChange("viewAnyDefinition", a.Permissions?.ViewAnyDefinition.ToString().ToLowerInvariant(), b.Permissions?.ViewAnyDefinition.ToString().ToLowerInvariant()));
                return changes;
            });
    }

    private static IEnumerable<(string Key, string Instance, SqlDatabase Db)> SqlDatabasesOf(CensusEnvelope e) =>
        (e.SqlServer?.Data?.Instances ?? [])
            .SelectMany(i => i.Databases.Select(d => ($"{i.InstanceName}|{d.Name}", i.InstanceName ?? "", d)));

    private static DiffSection DiffSqlDatabases(CensusEnvelope from, CensusEnvelope to)
    {
        var fromEntries = SqlDatabasesOf(from).ToDictionary(x => x.Key, x => x);
        var toEntries = SqlDatabasesOf(to).ToDictionary(x => x.Key, x => x);
        return DiffKeyed("sqlDatabases", fromEntries, toEntries,
            label: x => $"{x.Instance}: {x.Db.Name}",
            compare: (a, b) =>
            {
                var changes = new List<DiffFieldChange>();
                if (a.Db.StateDesc != b.Db.StateDesc) changes.Add(new DiffFieldChange("state", a.Db.StateDesc, b.Db.StateDesc));
                if (a.Db.RecoveryModelDesc != b.Db.RecoveryModelDesc) changes.Add(new DiffFieldChange("recoveryModel", a.Db.RecoveryModelDesc, b.Db.RecoveryModelDesc));
                if (a.Db.CompatibilityLevel != b.Db.CompatibilityLevel) changes.Add(new DiffFieldChange("compatibilityLevel", a.Db.CompatibilityLevel?.ToString(), b.Db.CompatibilityLevel?.ToString()));
                if (a.Db.IsReadOnly != b.Db.IsReadOnly) changes.Add(new DiffFieldChange("isReadOnly", a.Db.IsReadOnly.ToString().ToLowerInvariant(), b.Db.IsReadOnly.ToString().ToLowerInvariant()));
                if (a.Db.IsEncrypted != b.Db.IsEncrypted) changes.Add(new DiffFieldChange("isEncrypted", a.Db.IsEncrypted.ToString().ToLowerInvariant(), b.Db.IsEncrypted.ToString().ToLowerInvariant()));
                if (a.Db.Owner != b.Db.Owner) changes.Add(new DiffFieldChange("owner", a.Db.Owner, b.Db.Owner));
                return changes;
            });
    }

    private static IEnumerable<(string Key, string Instance, SqlDatabaseFile File)> SqlFilesOf(CensusEnvelope e) =>
        (e.SqlServer?.Data?.Instances ?? [])
            .SelectMany(i => i.DatabaseFiles.Select(f => ($"{i.InstanceName}|{f.DatabaseName}|{f.LogicalName}", i.InstanceName ?? "", f)));

    // File sizes are NOT compared: data files grow continuously, so diffing them would mark
    // every database on every server as changed every day and bury the real findings. Only
    // file configuration is compared. See census-web.md 10.3, decision S-2.
    private static DiffSection DiffSqlDatabaseFiles(CensusEnvelope from, CensusEnvelope to)
    {
        var fromEntries = SqlFilesOf(from).ToDictionary(x => x.Key, x => x);
        var toEntries = SqlFilesOf(to).ToDictionary(x => x.Key, x => x);
        return DiffKeyed("sqlDatabaseFiles", fromEntries, toEntries,
            label: x => $"{x.Instance}: {x.File.DatabaseName} / {x.File.LogicalName}",
            compare: (a, b) =>
            {
                var changes = new List<DiffFieldChange>();
                if (a.File.PhysicalName != b.File.PhysicalName) changes.Add(new DiffFieldChange("physicalName", a.File.PhysicalName, b.File.PhysicalName));
                if (a.File.MaxSizePages != b.File.MaxSizePages) changes.Add(new DiffFieldChange("maxSizePages", a.File.MaxSizePages?.ToString(), b.File.MaxSizePages?.ToString()));
                if (a.File.Growth != b.File.Growth) changes.Add(new DiffFieldChange("growth", a.File.Growth?.ToString(), b.File.Growth?.ToString()));
                if (a.File.IsPercentGrowth != b.File.IsPercentGrowth) changes.Add(new DiffFieldChange("isPercentGrowth", a.File.IsPercentGrowth.ToString().ToLowerInvariant(), b.File.IsPercentGrowth.ToString().ToLowerInvariant()));
                return changes;
            });
    }

    // Log *statistics* are deliberately not compared here. TotalBytes, FileCount, NewestUtc and
    // Last24hBytes change every day by design; diffing them would bury every real finding under
    // daily noise. Only log configuration is compared. See census-web.md 9.3.
    private static DiffSection DiffIisSites(CensusEnvelope from, CensusEnvelope to)
    {
        var fromEntries = (from.Iis?.Data?.Sites ?? []).Where(s => s.Name is not null).ToDictionary(s => s.Name!);
        var toEntries = (to.Iis?.Data?.Sites ?? []).Where(s => s.Name is not null).ToDictionary(s => s.Name!);
        return DiffKeyed("iisSites", fromEntries, toEntries,
            label: s => s.Name!,
            compare: (a, b) =>
            {
                var changes = new List<DiffFieldChange>();
                if (a.ServerAutoStart != b.ServerAutoStart) changes.Add(new DiffFieldChange("serverAutoStart", a.ServerAutoStart, b.ServerAutoStart));
                if (a.PhysicalPath?.Expanded != b.PhysicalPath?.Expanded) changes.Add(new DiffFieldChange("physicalPath", a.PhysicalPath?.Expanded, b.PhysicalPath?.Expanded));
                if (a.Bindings.Count != b.Bindings.Count) changes.Add(new DiffFieldChange("bindingCount", a.Bindings.Count.ToString(), b.Bindings.Count.ToString()));
                if (a.LogFile?.Enabled != b.LogFile?.Enabled) changes.Add(new DiffFieldChange("logEnabled", a.LogFile?.Enabled, b.LogFile?.Enabled));
                if (a.LogFile?.Directory?.Expanded != b.LogFile?.Directory?.Expanded) changes.Add(new DiffFieldChange("logDirectory", a.LogFile?.Directory?.Expanded, b.LogFile?.Directory?.Expanded));
                return changes;
            });
    }

    private static DiffSection DiffIisAppPools(CensusEnvelope from, CensusEnvelope to)
    {
        var fromEntries = (from.Iis?.Data?.AppPools ?? []).Where(p => p.Name is not null).ToDictionary(p => p.Name!);
        var toEntries = (to.Iis?.Data?.AppPools ?? []).Where(p => p.Name is not null).ToDictionary(p => p.Name!);
        return DiffKeyed("iisAppPools", fromEntries, toEntries,
            label: p => p.Name!,
            compare: (a, b) =>
            {
                var changes = new List<DiffFieldChange>();
                if (a.ManagedRuntimeVersion != b.ManagedRuntimeVersion) changes.Add(new DiffFieldChange("managedRuntimeVersion", a.ManagedRuntimeVersion, b.ManagedRuntimeVersion));
                if (a.ManagedPipelineMode != b.ManagedPipelineMode) changes.Add(new DiffFieldChange("managedPipelineMode", a.ManagedPipelineMode, b.ManagedPipelineMode));
                if (a.IdentityType != b.IdentityType) changes.Add(new DiffFieldChange("identityType", a.IdentityType, b.IdentityType));
                if (a.UserName != b.UserName) changes.Add(new DiffFieldChange("userName", a.UserName, b.UserName));
                return changes;
            });
    }

    private static DiffSection DiffIisApplications(CensusEnvelope from, CensusEnvelope to)
    {
        var fromEntries = (from.Iis?.Data?.Applications ?? []).ToDictionary(IisApplicationKey);
        var toEntries = (to.Iis?.Data?.Applications ?? []).ToDictionary(IisApplicationKey);
        return DiffKeyed("iisApplications", fromEntries, toEntries,
            label: a => $"{a.SiteName}{a.Path}",
            compare: (a, b) =>
            {
                var changes = new List<DiffFieldChange>();
                if (a.ApplicationPool != b.ApplicationPool) changes.Add(new DiffFieldChange("applicationPool", a.ApplicationPool, b.ApplicationPool));
                if (a.PhysicalPath?.Expanded != b.PhysicalPath?.Expanded) changes.Add(new DiffFieldChange("physicalPath", a.PhysicalPath?.Expanded, b.PhysicalPath?.Expanded));
                if (a.PoolManagedRuntimeVersion != b.PoolManagedRuntimeVersion) changes.Add(new DiffFieldChange("runtimeVersion", a.PoolManagedRuntimeVersion, b.PoolManagedRuntimeVersion));
                if (a.PoolIdentityType != b.PoolIdentityType) changes.Add(new DiffFieldChange("poolIdentityType", a.PoolIdentityType, b.PoolIdentityType));
                if (a.PoolUserName != b.PoolUserName) changes.Add(new DiffFieldChange("poolUserName", a.PoolUserName, b.PoolUserName));
                if (a.Runtime?.AspNetCore?.HostingModel != b.Runtime?.AspNetCore?.HostingModel) changes.Add(new DiffFieldChange("hostingModel", a.Runtime?.AspNetCore?.HostingModel, b.Runtime?.AspNetCore?.HostingModel));
                if (a.Status != b.Status) changes.Add(new DiffFieldChange("status", a.Status, b.Status));
                AddAuthChange(changes, "anonymousAuthentication", a.Auth?.AnonymousAuthentication, b.Auth?.AnonymousAuthentication);
                AddAuthChange(changes, "windowsAuthentication", a.Auth?.WindowsAuthentication, b.Auth?.WindowsAuthentication);
                return changes;
            });
    }

    private static void AddAuthChange(List<DiffFieldChange> changes, string field, IisAuthSetting? a, IisAuthSetting? b)
    {
        var fromValue = a is null ? null : a.Enabled.ToString().ToLowerInvariant();
        var toValue = b is null ? null : b.Enabled.ToString().ToLowerInvariant();
        if (fromValue != toValue) changes.Add(new DiffFieldChange(field, fromValue, toValue));
    }

    private static DiffSection DiffIisDependencies(CensusEnvelope from, CensusEnvelope to)
    {
        var fromEntries = (from.Iis?.Data?.Dependencies ?? []).ToDictionary(IisDependencyKey);
        var toEntries = (to.Iis?.Data?.Dependencies ?? []).ToDictionary(IisDependencyKey);
        return DiffKeyed("iisDependencies", fromEntries, toEntries,
            label: d => $"{d.SiteName}{d.AppPath} → {IisDependencyTarget(d)}",
            compare: (a, b) => IisDependencyTarget(a) != IisDependencyTarget(b)
                ? [new DiffFieldChange("target", IisDependencyTarget(a), IisDependencyTarget(b))]
                : []);
    }

    private static string IisApplicationKey(IisApplication a) => $"{a.SiteName}|{a.Path}";

    // Keyed on where the edge was declared, never on where it points - the target changing is
    // precisely the change worth surfacing.
    private static string IisDependencyKey(IisDependency d) => $"{d.SiteName}|{d.AppPath}|{d.SourceFile}|{d.Kind}|{d.Name}";

    private static string IisDependencyTarget(IisDependency d) => d.Kind switch
    {
        "http" => $"{d.Scheme}://{d.Host}:{d.Port}{d.Path}",
        "file" => d.FilePath ?? "",
        _ => $"{d.Host}{(d.Instance is null ? "" : "\\" + d.Instance)}{(d.Port is null ? "" : "," + d.Port)}/{d.Database}",
    };

    private static DiffSection DiffRoles(CensusEnvelope from, CensusEnvelope to)
    {
        var fromSet = new HashSet<string>(from.Roles);
        var toSet = new HashSet<string>(to.Roles);
        return new DiffSection
        {
            Name = "roles",
            Added = toSet.Except(fromSet).Select(r => new DiffItem { Key = r, Label = r }).ToList(),
            Removed = fromSet.Except(toSet).Select(r => new DiffItem { Key = r, Label = r }).ToList(),
        };
    }

    private static DiffSection DiffKeyed<T>(
        string name,
        Dictionary<string, T> from,
        Dictionary<string, T> to,
        Func<T, string> label,
        Func<T, T, List<DiffFieldChange>> compare)
    {
        var added = to.Keys.Except(from.Keys).Select(k => new DiffItem { Key = k, Label = label(to[k]) }).ToList();
        var removed = from.Keys.Except(to.Keys).Select(k => new DiffItem { Key = k, Label = label(from[k]) }).ToList();
        var changed = from.Keys.Intersect(to.Keys)
            .Select(k => new DiffItem { Key = k, Label = label(to[k]), Changes = compare(from[k], to[k]) })
            .Where(item => item.Changes.Count > 0)
            .ToList();

        return new DiffSection { Name = name, Added = added, Removed = removed, Changed = changed };
    }
}
