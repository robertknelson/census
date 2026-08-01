namespace Census.Web.Models.Assets;

public record AssetsConfig
{
    public int Version { get; init; } = 1;
    public OwnershipDimension? Ownership { get; init; }
    public Dictionary<string, AssetEntry> Assets { get; init; } = new(StringComparer.OrdinalIgnoreCase);
}

public record OwnershipDimension
{
    public required string Key { get; init; }
    public required string Label { get; init; }
}

public record AssetEntry
{
    public Dictionary<string, List<string>> Facets { get; init; } = new(StringComparer.OrdinalIgnoreCase);
}
