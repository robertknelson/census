using System.Collections.Generic;

namespace Census.Web.Models.Api;

public record DiffFieldChange(string Field, string From, string To);

public record DiffItem
{
    public required string Key { get; init; }
    public required string Label { get; init; }
    public List<DiffFieldChange> Changes { get; init; } = [];
}

public record DiffSection
{
    public required string Name { get; init; }
    public List<DiffItem> Added { get; init; } = [];
    public List<DiffItem> Removed { get; init; } = [];
    public List<DiffItem> Changed { get; init; } = [];
}

public record SnapshotDiffDto
{
    public required string Machine { get; init; }
    public required string FromDate { get; init; }
    public required string ToDate { get; init; }
    public List<DiffFieldChange> ScalarChanges { get; init; } = [];
    public List<DiffSection> Sections { get; init; } = [];
}
