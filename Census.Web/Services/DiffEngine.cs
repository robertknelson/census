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

    private static DiffSection DiffIisSites(CensusEnvelope from, CensusEnvelope to)
    {
        var fromEntries = (from.Iis?.Data?.Sites ?? []).Where(s => s.Name is not null).ToDictionary(s => s.Name!);
        var toEntries = (to.Iis?.Data?.Sites ?? []).Where(s => s.Name is not null).ToDictionary(s => s.Name!);
        return DiffKeyed("iisSites", fromEntries, toEntries,
            label: s => s.Name!,
            compare: (a, b) =>
            {
                var changes = new List<DiffFieldChange>();
                if (a.State != b.State) changes.Add(new DiffFieldChange("state", a.State, b.State));
                if (a.Bindings.Count != b.Bindings.Count) changes.Add(new DiffFieldChange("bindingCount", a.Bindings.Count.ToString(), b.Bindings.Count.ToString()));
                return changes;
            });
    }

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
