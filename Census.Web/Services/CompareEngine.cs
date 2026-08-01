using System.Text.RegularExpressions;
using Census.Web.Models.Api;
using Census.Web.Models.Census;

namespace Census.Web.Services;

/// <summary>
/// Builds the machines-as-columns comparison. Rows for collection aspects are the union of
/// keyed items across the selected machines (same keys DiffEngine uses). Volatile rows
/// (free space, pending reboot) are shown but never count against a group's "identical"
/// verdict — they are operational state, not configuration.
/// </summary>
public static partial class CompareEngine
{
    public static readonly string[] AllAspects = ["os", "hardware", "drives", "dotnet", "apps", "sqlserver"];

    [GeneratedRegex(@"^(\S+)\s+(\S+)\s+\[.*\]$")]
    private static partial Regex CoreRuntimeEntryPattern();

    [GeneratedRegex(@"^(\S+)\s+\[.*\]$")]
    private static partial Regex SdkEntryPattern();

    public static CompareResultDto Compute(List<string> machines, List<CensusEnvelope?> envelopes, List<string> aspects)
    {
        var groups = new List<CompareGroupDto>();
        foreach (var aspect in aspects)
        {
            switch (aspect)
            {
                case "os": groups.Add(BuildOs(envelopes)); break;
                case "hardware": groups.Add(BuildHardware(envelopes)); break;
                case "drives": groups.Add(BuildDrives(envelopes)); break;
                case "dotnet": groups.Add(BuildDotnet(envelopes)); break;
                case "apps": groups.Add(BuildApps(envelopes)); break;
                case "sqlserver": groups.Add(BuildSqlServer(envelopes)); break;
            }
        }

        return new CompareResultDto
        {
            Machines = machines,
            MachinesWithoutData = machines.Where((_, i) => envelopes[i] is null).ToList(),
            Groups = groups,
        };
    }

    private static CompareGroupDto BuildOs(List<CensusEnvelope?> envelopes)
    {
        var rows = new List<CompareRowDto>
        {
            Row("Product name", envelopes, e => e?.Os?.Data?.ProductName),
            Row("Edition", envelopes, e => e?.Os?.Data?.EditionId),
            Row("Installation type", envelopes, e => e?.Os?.Data?.InstallationType),
            Row("Build", envelopes, e => e?.Os?.Data is { } os ? $"{os.CurrentBuild}.{os.Ubr}" : null),
            Row("Display version", envelopes, e => e?.Os?.Data?.DisplayVersion),
            Row("Architecture", envelopes, e => e?.Os?.Data?.Architecture),
            Row("OS installed", envelopes, e => e?.Os?.Data?.InstallDate?.ToString("yyyy-MM-dd"), isVolatile: true),
            Row("Last update installed", envelopes, e => e?.Updates?.Data?.LastInstallSuccessTime, isVolatile: true),
            Row("Pending reboot", envelopes, e => e?.Os?.Data is { } o ? (o.PendingReboot ? "yes" : "no") : null, isVolatile: true),
        };
        return Group("os", "Operating system", rows);
    }

    private static CompareGroupDto BuildHardware(List<CensusEnvelope?> envelopes)
    {
        var rows = new List<CompareRowDto>
        {
            Row("Physical / virtual", envelopes, e => e?.Identity?.Data is { } id ? (id.IsVirtual ? $"virtual ({string.Join(", ", id.HypervisorSignals)})" : "physical") : null),
            Row("Manufacturer / model", envelopes, e => e?.Identity?.Data is { } id ? $"{id.Manufacturer} {id.Model}" : null),
            Row("CPU sockets", envelopes, e => e?.Identity?.Data?.CpuSockets.ToString()),
            Row("CPU cores", envelopes, e => e?.Identity?.Data?.CpuCores.ToString()),
            Row("CPU logical processors", envelopes, e => e?.Identity?.Data?.CpuLogicalProcessors.ToString()),
            Row("RAM (GB)", envelopes, e => e?.Memory?.Data?.TotalPhysicalMemoryGB.ToString("0.#")),
        };
        return Group("hardware", "Hardware", rows);
    }

    private static CompareGroupDto BuildDrives(List<CensusEnvelope?> envelopes)
    {
        var letters = envelopes
            .SelectMany(e => e?.Drives?.Data?.Drives ?? [])
            .Select(d => d.DriveLetter)
            .Where(l => l is not null)
            .Distinct()
            .OrderBy(l => l)
            .ToList();

        var rows = new List<CompareRowDto>();
        foreach (var letter in letters)
        {
            DriveEntry? Find(CensusEnvelope? e) => (e?.Drives?.Data?.Drives ?? []).FirstOrDefault(d => d.DriveLetter == letter);
            rows.Add(Row($"{letter}: size (GB)", envelopes, e => Find(e)?.SizeBytes is { } b ? (b / 1_073_741_824.0).ToString("0.#") : null));
            rows.Add(Row($"{letter}: % free", envelopes, e => Find(e)?.PercentFree?.ToString("0.#"), isVolatile: true));
        }
        return Group("drives", "Drives", rows);
    }

    private static CompareGroupDto BuildDotnet(List<CensusEnvelope?> envelopes)
    {
        var rows = new List<CompareRowDto>
        {
            Row("Framework release ID", envelopes, e => e?.Dotnet?.Data?.FrameworkReleaseId?.ToString()),
        };

        rows.AddRange(PresenceRows(envelopes,
            e => (e?.Dotnet?.Data?.CoreRuntimes ?? [])
                .Select(raw => CoreRuntimeEntryPattern().Match(raw))
                .Where(m => m.Success)
                .Select(m => $"{m.Groups[1].Value} {m.Groups[2].Value}"),
            label => $"Runtime: {label}"));

        rows.AddRange(PresenceRows(envelopes,
            e => (e?.Dotnet?.Data?.Sdks ?? [])
                .Select(raw => SdkEntryPattern().Match(raw))
                .Where(m => m.Success)
                .Select(m => m.Groups[1].Value),
            label => $"SDK: {label}"));

        return Group("dotnet", ".NET", rows);
    }

    private static CompareGroupDto BuildApps(List<CensusEnvelope?> envelopes)
    {
        var keys = envelopes
            .SelectMany(e => e?.Apps?.Data?.Entries ?? [])
            .Select(a => (a.DisplayName, a.Architecture, a.Hive, a.Sid))
            .Where(k => k.DisplayName is not null)
            .Distinct()
            .OrderBy(k => k.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var rows = keys.Select(key =>
        {
            var scope = key.Hive == "HKU" ? ", per-user" : "";
            return Row($"{key.DisplayName} ({key.Architecture}{scope})", envelopes, e =>
            {
                var entry = (e?.Apps?.Data?.Entries ?? []).FirstOrDefault(a =>
                    a.DisplayName == key.DisplayName && a.Architecture == key.Architecture && a.Hive == key.Hive && a.Sid == key.Sid);
                if (entry is null) return null;
                return entry.DisplayVersion ?? "(installed)";
            });
        }).ToList();

        return Group("apps", "Installed software", rows);
    }

    private static CompareGroupDto BuildSqlServer(List<CensusEnvelope?> envelopes)
    {
        var instanceNames = envelopes
            .SelectMany(e => e?.SqlServer?.Data?.Instances ?? [])
            .Select(i => i.InstanceName)
            .Where(n => n is not null)
            .Distinct()
            .OrderBy(n => n)
            .ToList();

        var rows = new List<CompareRowDto>();
        foreach (var name in instanceNames)
        {
            SqlInstance? Find(CensusEnvelope? e) => (e?.SqlServer?.Data?.Instances ?? []).FirstOrDefault(i => i.InstanceName == name);
            rows.Add(Row($"{name}: edition", envelopes, e => Find(e)?.Edition));
            rows.Add(Row($"{name}: patch level", envelopes, e => Find(e)?.PatchLevel));
            rows.Add(Row($"{name}: TCP port", envelopes, e => Find(e) is { } i ? (string.IsNullOrEmpty(i.TcpPort) ? $"dynamic ({i.TcpDynamicPorts})" : i.TcpPort) : null));
            rows.Add(Row($"{name}: service state", envelopes, e => Find(e)?.ServiceState, isVolatile: true));
        }
        return Group("sqlserver", "SQL Server", rows);
    }

    /// <summary>One present/absent row per distinct item across all machines.</summary>
    private static IEnumerable<CompareRowDto> PresenceRows(
        List<CensusEnvelope?> envelopes,
        Func<CensusEnvelope?, IEnumerable<string>> itemsOf,
        Func<string, string> labelOf)
    {
        var perMachine = envelopes.Select(e => itemsOf(e).ToHashSet()).ToList();
        return perMachine
            .SelectMany(s => s)
            .Distinct()
            .OrderBy(s => s, StringComparer.OrdinalIgnoreCase)
            .Select(item => Row(labelOf(item), envelopes, (_, i) => perMachine[i].Contains(item) ? "✓" : null));
    }

    private static CompareRowDto Row(string label, List<CensusEnvelope?> envelopes, Func<CensusEnvelope?, string?> valueOf, bool isVolatile = false) =>
        Row(label, envelopes, (e, _) => valueOf(e), isVolatile);

    private static CompareRowDto Row(string label, List<CensusEnvelope?> envelopes, Func<CensusEnvelope?, int, string?> valueOf, bool isVolatile = false)
    {
        var values = envelopes.Select(valueOf).ToList();
        return new CompareRowDto
        {
            Label = label,
            Values = values,
            Differs = values.Select(v => v ?? "\0absent").Distinct().Count() > 1,
            Volatile = isVolatile,
        };
    }

    private static CompareGroupDto Group(string name, string title, List<CompareRowDto> rows) => new()
    {
        Name = name,
        Title = title,
        Identical = !rows.Any(r => r.Differs && !r.Volatile),
        DifferCount = rows.Count(r => r.Differs && !r.Volatile),
        Rows = rows,
    };
}
