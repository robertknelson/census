using System;
using System.Collections.Generic;

namespace Census.Web.Services;

/// <summary>Provisional ordering only — severity tiers aren't ratified yet (census-web.md §8).</summary>
public static class SeverityRanking
{
    private static readonly Dictionary<string, int> Rank = new(StringComparer.OrdinalIgnoreCase)
    {
        ["critical"] = 0,
        ["high"] = 1,
        ["medium"] = 2,
        ["low"] = 3,
    };

    public static int RankOf(string severity) => Rank.GetValueOrDefault(severity, int.MaxValue);
}
