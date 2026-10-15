using System;
using System.Collections.Generic;
using System.Linq;
using Census.Web.Models.Api;

namespace Census.Web.Services;

/// <summary>
/// A snapshot diff flattened into the change feed's rows (census-web.md Changes panel;
/// day-view.md §10): the OS scalars as one "os" section, then every section's added,
/// removed and changed items as single lines. Shared by the fleet feed and the day page so
/// a row reads the same on both.
/// </summary>
public static class ChangeEntries
{
    /// <param name="expectation">Optional judge of a section's item (section, kind, item) → expected | unexpected | null.</param>
    public static List<ChangeEntryDto> Flatten(SnapshotDiffDto diff, Func<string, string, DiffItem, string> expectation = null)
    {
        expectation ??= (_, _, _) => null;
        var entries = new List<ChangeEntryDto>();
        entries.AddRange(diff.ScalarChanges.Select(c => new ChangeEntryDto
        {
            Section = "os",
            Kind = "changed",
            Text = $"{c.Field}: {c.From} → {c.To}",
        }));
        foreach (var section in diff.Sections)
        {
            entries.AddRange(section.Added.Select(i => new ChangeEntryDto { Section = section.Name, Kind = "added", Text = i.Label, Expectation = expectation(section.Name, "added", i) }));
            entries.AddRange(section.Removed.Select(i => new ChangeEntryDto { Section = section.Name, Kind = "removed", Text = i.Label, Expectation = expectation(section.Name, "removed", i) }));
            entries.AddRange(section.Changed.Select(i => new ChangeEntryDto
            {
                Section = section.Name,
                Kind = "changed",
                Text = $"{i.Label}: {string.Join(", ", i.Changes.Select(c => $"{c.Field} {c.From} → {c.To}"))}",
            }));
        }
        return entries;
    }
}
