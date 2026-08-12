namespace Census.Web.Models.Api;

public record SoftwareVersionDto
{
    public required string Version { get; init; }
    public List<string> Machines { get; init; } = [];
}

public record SoftwareItemDto
{
    public required string Name { get; init; }
    public string? Publisher { get; init; }
    public int MachineCount { get; init; }

    /// <summary>Machines carrying this software that no matching baseline approves it on.</summary>
    public List<string> UnapprovedOn { get; init; } = [];

    public List<SoftwareVersionDto> Versions { get; init; } = [];
}

public record SoftwareInventoryDto
{
    public List<SoftwareItemDto> Items { get; init; } = [];
}
