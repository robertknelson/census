using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Census.Web.Models.Census;
using Census.Web.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

public record MachineSnapshotRef(string MachineDir, DateOnly Date, string FilePath);

public partial class CensusStore
{
    private readonly string _rootPath;
    private readonly string _machinesConfigPath;
    private readonly ILogger<CensusStore> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    public CensusStore(IOptions<CensusOptions> options, IHostEnvironment env, ILogger<CensusStore> logger)
    {
        _logger = logger;
        var opts = options.Value;
        _rootPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, opts.RootPath));
        _machinesConfigPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, opts.MachinesConfigPath));
    }

    [GeneratedRegex(@"^.+-census-(\d{8})\.json(\.gz)?$", RegexOptions.IgnoreCase)]
    private static partial Regex CensusFileNamePattern();

    public MachinesConfig GetMachinesConfig()
    {
        if (!File.Exists(_machinesConfigPath)) return new MachinesConfig();
        var json = File.ReadAllText(_machinesConfigPath);
        return JsonSerializer.Deserialize<MachinesConfig>(json, JsonOptions) ?? new MachinesConfig();
    }

    /// <summary>
    /// The run log is append-only JSON Lines — one entry per line, written with Add-Content
    /// and never read back by the collector, so a bad write can only ever cost the lines it
    /// wrote, not the history. Each line deserializes independently: a line that does not fit
    /// the current shape (older collector, truncated final line from a crash mid-write) is
    /// skipped and counted, never thrown on — the same rule the collector holds itself to
    /// (census-collector.md 7.2): one failed part records its failure, it does not abort the
    /// whole.
    /// </summary>
    public List<RunLogEntry> GetRunLog()
    {
        var runsDir = Path.Combine(_rootPath, "_runs");

        // Pre-rotation history first, then the yearly segments in order — concatenation
        // reproduces append order, and the pre-rotation file is never migrated into a
        // segment: it is history, and history does not get rewritten (snapshot-aging.md §5).
        var paths = new List<string>();
        var preRotationPath = Path.Combine(runsDir, "run-log.jsonl");
        if (File.Exists(preRotationPath)) paths.Add(preRotationPath);
        if (Directory.Exists(runsDir))
        {
            paths.AddRange(Directory.GetFiles(runsDir, "run-log-*.jsonl").OrderBy(p => p, StringComparer.OrdinalIgnoreCase));
        }

        if (paths.Count == 0)
        {
            var legacyPath = Path.Combine(runsDir, "run-log.json");
            if (File.Exists(legacyPath))
            {
                _logger.LogWarning(
                    "Found legacy run log at {LegacyPath} but no run-log.jsonl. Run " +
                    "Repair-CensusRunLog.ps1 -Execute to convert it; until then coverage " +
                    "and findings see no run history.", legacyPath);
            }
            return [];
        }

        var entries = new List<RunLogEntry>();
        foreach (var path in paths)
        {
            var skipped = 0;
            foreach (var line in File.ReadLines(path))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                try
                {
                    var entry = JsonSerializer.Deserialize<RunLogEntry>(line, JsonOptions);
                    if (entry is not null) entries.Add(entry); else skipped++;
                }
                catch (JsonException)
                {
                    skipped++;
                }
            }

            if (skipped > 0)
            {
                _logger.LogWarning(
                    "Run log at {Path}: skipped {Skipped} lines that do not parse as " +
                    "a run-log entry. Lines written by an older collector carry no collectorVersion.",
                    path, skipped);
            }
        }
        return entries;
    }

    /// <summary>
    /// One read and parse of the log for callers that iterate the fleet — asking per machine
    /// re-reads the whole file once per machine, which is quadratic in fleet size.
    /// </summary>
    public Dictionary<string, List<RunLogEntry>> GetRunLogByMachine()
    {
        var byMachine = new Dictionary<string, List<RunLogEntry>>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in GetRunLog())
        {
            if (!byMachine.TryGetValue(entry.Machine, out var list))
            {
                byMachine[entry.Machine] = list = [];
            }
            list.Add(entry);
        }
        foreach (var list in byMachine.Values)
        {
            list.Sort((a, b) => a.StartedUtc.CompareTo(b.StartedUtc));
        }
        return byMachine;
    }

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
        foreach (var filePath in Directory.GetFiles(dirPath, "*-census-*.json*"))
        {
            var match = CensusFileNamePattern().Match(Path.GetFileName(filePath));
            if (!match.Success) continue;
            if (!DateOnly.TryParseExact(match.Groups[1].Value, "yyyyMMdd", out var date)) continue;
            refs.Add(new MachineSnapshotRef(machineDir, date, filePath));
        }
        // Both encodings for one date means aging was interrupted between writing the .gz
        // and deleting the .json — the .json wins, being the file whose write was
        // known-complete; the next aging pass finishes the job (snapshot-aging.md §4).
        return refs
            .GroupBy(r => r.Date)
            .Select(g => g.OrderBy(r => r.FilePath.EndsWith(".gz", StringComparison.OrdinalIgnoreCase) ? 1 : 0).First())
            .OrderBy(r => r.Date)
            .ToList();
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
        if (filePath.EndsWith(".gz", StringComparison.OrdinalIgnoreCase))
        {
            using var file = File.OpenRead(filePath);
            using var gzip = new GZipStream(file, CompressionMode.Decompress);
            using var reader = new StreamReader(gzip);
            return JsonSerializer.Deserialize<CensusEnvelope>(reader.ReadToEnd(), JsonOptions);
        }
        var json = File.ReadAllText(filePath);
        return JsonSerializer.Deserialize<CensusEnvelope>(json, JsonOptions);
    }
}
