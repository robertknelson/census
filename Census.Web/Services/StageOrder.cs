using System;
using System.Collections.Generic;
using System.Linq;

namespace Census.Web.Services;

/// <summary>
/// The order stages read in wherever Census lists them (census-web.md §14): the configured
/// <c>Census:StageOrder</c> first, in that order, matched case-insensitively; any stage it
/// does not name comes after, alphabetically — shown, never dropped, and placed by adding
/// it to the setting. Static like <see cref="HostResolver"/>, because the helpers that list
/// stages are static too; set once at startup.
/// </summary>
public static class StageOrder
{
    private static List<string> order = [];

    public static void Configure(IEnumerable<string> configured) =>
        order = (configured ?? []).Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()).ToList();

    public static IReadOnlyList<string> Order => order;

    public static readonly IComparer<string> Comparer = Comparer<string>.Create(Compare);

    public static int Compare(string a, string b)
    {
        var ra = Rank(a);
        var rb = Rank(b);
        if (ra != rb) return ra.CompareTo(rb);
        return StringComparer.OrdinalIgnoreCase.Compare(a, b);
    }

    private static int Rank(string stage)
    {
        var i = order.FindIndex(s => string.Equals(s, stage, StringComparison.OrdinalIgnoreCase));
        return i < 0 ? int.MaxValue : i;
    }
}
