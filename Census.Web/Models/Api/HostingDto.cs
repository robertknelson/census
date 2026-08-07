namespace Census.Web.Models.Api;

public record HostedAppInstanceDto
{
    public required string Machine { get; init; }
    public string? Runtime { get; init; }
    public string? AppPool { get; init; }
    public string? Identity { get; init; }
    public string? PhysicalPath { get; init; }
}

public record HostedAppDto
{
    public required string SiteName { get; init; }
    public required string Path { get; init; }
    public int MachineCount { get; init; }
    /// <summary>Distinct runtimes across the hosting machines. More than one is the finding.</summary>
    public List<string> Runtimes { get; init; } = [];
    public List<HostedAppInstanceDto> Instances { get; init; } = [];
}

public record HostedDatabaseInstanceDto
{
    public required string Machine { get; init; }
    public required string Instance { get; init; }
    public string? State { get; init; }
    public string? RecoveryModel { get; init; }
    public string? Owner { get; init; }
    public List<string> Directories { get; init; } = [];
}

public record HostedDatabaseDto
{
    public required string Name { get; init; }
    public int InstanceCount { get; init; }
    public List<HostedDatabaseInstanceDto> Instances { get; init; } = [];
}

public record DependencySourceDto
{
    public required string Machine { get; init; }
    public string? SiteName { get; init; }
    public string? AppPath { get; init; }
    public string? Name { get; init; }
    public string? SourceFile { get; init; }
    public bool SecretsPresent { get; init; }
    public bool HadCredentials { get; init; }
    public bool HadQuery { get; init; }
}

public record DependencyTargetDto
{
    public required string Target { get; init; }
    public required string Kind { get; init; }
    public string? Host { get; init; }
    public string? Instance { get; init; }
    public string? Database { get; init; }
    public bool IsLocal { get; init; }
    /// <summary>confirmed | contradicted | unobserved. See census-web.md 11.5.</summary>
    public required string Corroboration { get; init; }
    public string? CorroborationDetail { get; init; }
    public int SourceCount { get; init; }
    public List<DependencySourceDto> Sources { get; init; } = [];
}

public record HostingDto
{
    public List<HostedAppDto> Applications { get; init; } = [];
    public List<HostedDatabaseDto> Databases { get; init; } = [];
    public List<DependencyTargetDto> Dependencies { get; init; } = [];
}
