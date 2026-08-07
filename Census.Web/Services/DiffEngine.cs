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
        var fromEntries = (from.Apps?.Data?.Entries ?? []).ToDictionary(AppKey);
        var toEntries = (to.Apps?.Data?.Entries ?? []).ToDictionary(AppKey);
        return DiffKeyed("apps", fromEntries, toEntries,
            label: e => $"{e.DisplayName} ({e.Architecture}, {e.Hive})",
            compare: (a, b) => a.DisplayVersion != b.DisplayVersion
                ? [new DiffFieldChange("displayVersion", a.DisplayVersion, b.DisplayVersion)]
                : []);
    }

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
