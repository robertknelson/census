using System.Collections.Generic;

namespace Census.Web.Options;

public class CensusOptions
{
    public const string SectionName = "Census";

    public required string RootPath { get; set; }
    public required string MachinesConfigPath { get; set; }
    public required string BlacklistConfigPath { get; set; }
    public required string AssetsConfigPath { get; set; }
    public required string BaselinesConfigPath { get; set; }
    public required string EntityTagsConfigPath { get; set; }
    public required string DeclaredEntitiesConfigPath { get; set; }
    public required string SystemsConfigPath { get; set; }
    public required string ViewsConfigPath { get; set; }
    public required string StageCrossingsConfigPath { get; set; }

    /// <summary>The order stages are listed in (census-web.md §14); unnamed stages follow, alphabetically.</summary>
    public List<string> StageOrder { get; set; } = [];

    // The dossier's History list (census-web.md §16) diffs consecutive collected days on the
    // fly; "all" on a machine with a year of nights is a year of diffs, so the list stops at
    // this many pairs, newest first, and says so.
    public int ChangesNightsMax { get; set; } = 120;

    // Parsed snapshots are kept in memory once read (day-view.md §12): the day page and the
    // findings stream read the same files many times over per request, and the month grid
    // reads every snapshot in the month. Keyed on path, length and last-write time, so a
    // replaced file is never served stale. One entry per snapshot; the limit bounds memory
    // (a real machine's snapshot parses to a few hundred KB), the minutes bound staleness of
    // the directory listing's companions, not the data.
    public int SnapshotCacheEntries { get; set; } = 1000;
    public int SnapshotCacheMinutes { get; set; } = 10;
}
