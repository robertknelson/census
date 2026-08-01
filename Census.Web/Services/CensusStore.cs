using System.Text.Json;
using System.Text.RegularExpressions;
using Census.Web.Models.Census;
using Census.Web.Options;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

public record MachineSnapshotRef(string MachineDir, DateOnly Date, string FilePath);

public partial class CensusStore
{
    private readonly string _rootPath;
    private readonly string _machinesConfigPath;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    public CensusStore(IOptions<CensusOptions> options, IHostEnvironment env)
    {
        var opts = options.Value;
        _rootPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, opts.RootPath));
        _machinesConfigPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, opts.MachinesConfigPath));
    }

    [GeneratedRegex(@"^.+-census-(\d{8})\.json$", RegexOptions.IgnoreCase)]
    private static partial Regex CensusFileNamePattern();

    public MachinesConfig GetMachinesConfig()
    {
        if (!File.Exists(_machinesConfigPath)) return new MachinesConfig();
        var json = File.ReadAllText(_machinesConfigPath);
        return JsonSerializer.Deserialize<MachinesConfig>(json, JsonOptions) ?? new MachinesConfig();
    }

    public List<RunLogEntry> GetRunLog()
    {
        var path = Path.Combine(_rootPath, "_runs", "run-log.json");
        if (!File.Exists(path)) return [];
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<List<RunLogEntry>>(json, JsonOptions) ?? [];
    }

    public List<RunLogEntry> GetRunLogFor(string machine) =>
        GetRunLog()
            .Where(e => string.Equals(e.Machine, machine, StringComparison.OrdinalIgnoreCase))
            .OrderBy(e => e.StartedUtc)
            .ToList();

    public IReadOnlyList<string> GetMachineDirs()
    {
        if (!Directory.Exists(_rootPath)) return [];
        return Directory.GetDirectories(_rootPath)
            .Select(Path.GetFileName)
            .Where(name => name is not null && !name.Equals("_runs", StringComparison.OrdinalIgnoreCase))
            .Select(name => name!)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public IReadOnlyList<MachineSnapshotRef> GetSnapshotRefs(string machineDir)
    {
        var dirPath = Path.Combine(_rootPath, machineDir);
        if (!Directory.Exists(dirPath)) return [];

        var refs = new List<MachineSnapshotRef>();
        foreach (var filePath in Directory.GetFiles(dirPath, "*-census-*.json"))
        {
            var match = CensusFileNamePattern().Match(Path.GetFileName(filePath));
            if (!match.Success) continue;
            if (!DateOnly.TryParseExact(match.Groups[1].Value, "yyyyMMdd", out var date)) continue;
            refs.Add(new MachineSnapshotRef(machineDir, date, filePath));
        }
        return refs.OrderBy(r => r.Date).ToList();
    }

    public CensusEnvelope? GetLatestSnapshot(string machineDir)
    {
        var latest = GetSnapshotRefs(machineDir).LastOrDefault();
        return latest is null ? null : ReadSnapshot(latest.FilePath);
    }

    /// <summary>The machine's most recent snapshot on or before the given date.</summary>
    public MachineSnapshotRef? GetSnapshotRefAsOf(string machineDir, DateOnly asOf) =>
        GetSnapshotRefs(machineDir).LastOrDefault(r => r.Date <= asOf);

    public CensusEnvelope? GetSnapshotAsOf(string machineDir, DateOnly asOf)
    {
        var match = GetSnapshotRefAsOf(machineDir, asOf);
        return match is null ? null : ReadSnapshot(match.FilePath);
    }

    /// <summary>Every date any machine was collected on, newest first.</summary>
    public List<DateOnly> GetFleetDates() =>
        GetMachineDirs()
            .SelectMany(GetSnapshotRefs)
            .Select(r => r.Date)
            .Distinct()
            .OrderByDescending(d => d)
            .ToList();

    public CensusEnvelope? GetSnapshot(string machineDir, DateOnly date)
    {
        var match = GetSnapshotRefs(machineDir).FirstOrDefault(r => r.Date == date);
        return match is null ? null : ReadSnapshot(match.FilePath);
    }

    private static CensusEnvelope? ReadSnapshot(string filePath)
    {
        var json = File.ReadAllText(filePath);
        return JsonSerializer.Deserialize<CensusEnvelope>(json, JsonOptions);
    }
}
