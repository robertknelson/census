using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Census.Web.Models.Blacklist;
using Census.Web.Models.Census;
using Census.Web.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Census.Web.Services;

public partial class BlacklistEvaluator
{
    private readonly string _blacklistConfigPath;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    public BlacklistEvaluator(IOptions<CensusOptions> options, IHostEnvironment env)
    {
        _blacklistConfigPath = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.BlacklistConfigPath));
    }

    [GeneratedRegex(@"^(\S+)\s+(\S+)\s+\[.*\]$")]
    private static partial Regex CoreRuntimeEntryPattern();

    [GeneratedRegex(@"^(\S+)\s+\[.*\]$")]
    private static partial Regex SdkEntryPattern();

    public BlacklistConfig LoadConfig()
    {
        if (!File.Exists(_blacklistConfigPath)) return new BlacklistConfig();
        var json = File.ReadAllText(_blacklistConfigPath);
        return JsonSerializer.Deserialize<BlacklistConfig>(json, JsonOptions) ?? new BlacklistConfig();
    }

    public List<BlacklistHit> Evaluate(CensusEnvelope envelope)
    {
        var config = LoadConfig();
        var hits = new List<BlacklistHit>();

        foreach (var rule in config.Rules.Where(r => r.Active))
        {
            hits.AddRange(rule.Target switch
            {
                "apps" => EvaluateApps(rule, envelope),
                "dotnet.coreRuntimes" => EvaluateDotnetEntries(rule, envelope.Dotnet?.Data?.CoreRuntimes, CoreRuntimeEntryPattern()),
                "dotnet.sdks" => EvaluateDotnetEntries(rule, envelope.Dotnet?.Data?.Sdks, SdkEntryPattern()),
                _ => [],
            });
        }

        return hits;
    }

    private static IEnumerable<BlacklistHit> EvaluateApps(BlacklistRule rule, CensusEnvelope envelope)
    {
        var entries = envelope.Apps?.Data?.Entries ?? [];
        foreach (var entry in entries)
        {
            var fieldValue = rule.Match.Field switch
            {
                "displayName" => entry.DisplayName,
                "publisher" => entry.Publisher,
                _ => null,
            };
            if (fieldValue is null || !MatchesField(fieldValue, rule.Match)) continue;

            var hit = TryBuildHit(rule, entry.DisplayName ?? fieldValue, entry.DisplayVersion);
            if (hit is not null) yield return hit;
        }
    }

    private static IEnumerable<BlacklistHit> EvaluateDotnetEntries(BlacklistRule rule, List<string>? rawEntries, Regex pattern)
    {
        if (rawEntries is null) yield break;

        foreach (var raw in rawEntries)
        {
            var match = pattern.Match(raw);
            if (!match.Success) continue;

            // coreRuntimes entries have (name, version); sdks entries have (version) only.
            var name = match.Groups.Count > 2 ? match.Groups[1].Value : ".NET SDK";
            var version = match.Groups.Count > 2 ? match.Groups[2].Value : match.Groups[1].Value;

            if (rule.Match.Field == "name" && !MatchesField(name, rule.Match)) continue;

            var hit = TryBuildHit(rule, name, version);
            if (hit is not null) yield return hit;
        }
    }

    private static bool MatchesField(string fieldValue, BlacklistMatch match) => match.MatchType switch
    {
        "exact" => string.Equals(fieldValue, match.Value, StringComparison.OrdinalIgnoreCase),
        "contains" => fieldValue.Contains(match.Value, StringComparison.OrdinalIgnoreCase),
        "regex" => Regex.IsMatch(fieldValue, match.Value, RegexOptions.IgnoreCase),
        _ => false,
    };

    private static BlacklistHit? TryBuildHit(BlacklistRule rule, string matchedName, string? actualVersion)
    {
        if (rule.Version is null)
        {
            return new BlacklistHit
            {
                RuleId = rule.Id,
                Severity = rule.Severity,
                Reason = rule.Reason,
                Target = rule.Target,
                MatchedName = matchedName,
                MatchedVersion = actualVersion,
            };
        }

        if (actualVersion is null) return null;

        var comparison = VersionComparer.TryCompare(actualVersion, rule.Version.Value);
        if (comparison is null)
        {
            return new BlacklistHit
            {
                RuleId = rule.Id,
                Severity = rule.Severity,
                Reason = rule.Reason,
                Target = rule.Target,
                MatchedName = matchedName,
                MatchedVersion = actualVersion,
                VersionUnparseable = true,
            };
        }

        var satisfied = rule.Version.Op switch
        {
            "<" => comparison < 0,
            "<=" => comparison <= 0,
            "==" => comparison == 0,
            ">=" => comparison >= 0,
            ">" => comparison > 0,
            _ => false,
        };

        if (!satisfied) return null;

        return new BlacklistHit
        {
            RuleId = rule.Id,
            Severity = rule.Severity,
            Reason = rule.Reason,
            Target = rule.Target,
            MatchedName = matchedName,
            MatchedVersion = actualVersion,
        };
    }
}

public static class VersionComparer
{
    /// <summary>Dotted-numeric component-wise comparison; null if either side doesn't parse that way.</summary>
    public static int? TryCompare(string left, string right)
    {
        if (!TryParseComponents(left, out var leftParts) || !TryParseComponents(right, out var rightParts))
            return null;

        var length = Math.Max(leftParts.Length, rightParts.Length);
        for (var i = 0; i < length; i++)
        {
            var l = i < leftParts.Length ? leftParts[i] : 0;
            var r = i < rightParts.Length ? rightParts[i] : 0;
            var cmp = l.CompareTo(r);
            if (cmp != 0) return cmp;
        }
        return 0;
    }

    private static bool TryParseComponents(string version, out int[] parts)
    {
        var segments = version.Split('.');
        parts = new int[segments.Length];
        for (var i = 0; i < segments.Length; i++)
        {
            if (!int.TryParse(segments[i], out parts[i])) return false;
        }
        return true;
    }
}
