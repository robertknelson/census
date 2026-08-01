namespace Census.Web.Models.Census;

public record CensusCategory<T>
{
    public required string Status { get; init; }
    public T? Data { get; init; }
    public int DurationMs { get; init; }
    public string? Reason { get; init; }
}

public record CensusEnvelope
{
    public int SchemaVersion { get; init; }
    public required string ComputerName { get; init; }
    public DateTimeOffset CollectedUtc { get; init; }
    public CensusCategory<IdentityData>? Identity { get; init; }
    public CensusCategory<MemoryData>? Memory { get; init; }
    public CensusCategory<OsData>? Os { get; init; }
    public CensusCategory<UpdatesData>? Updates { get; init; }
    public CensusCategory<DotnetData>? Dotnet { get; init; }
    public CensusCategory<DrivesData>? Drives { get; init; }
    public CensusCategory<AppsData>? Apps { get; init; }
    public CensusCategory<IisData>? Iis { get; init; }
    public CensusCategory<CertificatesData>? Certificates { get; init; }
    public CensusCategory<SqlServerData>? SqlServer { get; init; }
    public required string RequestedName { get; init; }
    public List<string> Roles { get; init; } = [];
}

public record IdentityData
{
    public string? Domain { get; init; }
    public string? Manufacturer { get; init; }
    public string? Model { get; init; }
    public string? SmbiosUuid { get; init; }
    public string? MachineGuid { get; init; }
    public string? BiosSerialNumber { get; init; }
    public bool IsVirtual { get; init; }
    public List<string> HypervisorSignals { get; init; } = [];
    public int CpuSockets { get; init; }
    public int CpuCores { get; init; }
    public int CpuLogicalProcessors { get; init; }
}

public record MemoryData
{
    public long TotalPhysicalMemoryBytes { get; init; }
    public double TotalPhysicalMemoryGB { get; init; }
}

public record OsData
{
    public string? ProductName { get; init; }
    public string? EditionId { get; init; }
    public string? InstallationType { get; init; }
    public string? CurrentBuild { get; init; }
    public int Ubr { get; init; }
    public string? DisplayVersion { get; init; }
    public string? Architecture { get; init; }
    public DateTimeOffset? InstallDate { get; init; }
    public DateTimeOffset? LastBootUpTime { get; init; }
    public bool PendingReboot { get; init; }
    public List<string> PendingRebootReasons { get; init; } = [];
}

public record UpdatesData
{
    public string? CurrentBuild { get; init; }
    public int Ubr { get; init; }
    public string? LastDetectSuccessTime { get; init; }
    public string? LastInstallSuccessTime { get; init; }
}

public record DotnetData
{
    public long? FrameworkReleaseId { get; init; }
    public List<string> CoreRuntimes { get; init; } = [];
    public List<string> Sdks { get; init; } = [];
}

public record DriveEntry
{
    public string? DriveLetter { get; init; }
    public string? Label { get; init; }
    public string? FileSystem { get; init; }
    public string? DriveType { get; init; }
    public string? HealthStatus { get; init; }
    public long? SizeBytes { get; init; }
    public long? FreeBytes { get; init; }
    public long? UsedBytes { get; init; }
    public double? PercentFree { get; init; }
}

public record DrivesData
{
    public List<DriveEntry> Drives { get; init; } = [];
}

public record AppEntry
{
    public string? DisplayName { get; init; }
    public string? DisplayVersion { get; init; }
    public string? Publisher { get; init; }
    public string? InstallDate { get; init; }
    public string? InstallLocation { get; init; }
    public bool SystemComponent { get; init; }
    public string? Hive { get; init; }
    public string? Architecture { get; init; }
    public string? Sid { get; init; }
}

public record AppsData
{
    public int Count { get; init; }
    public List<AppEntry> Entries { get; init; } = [];
}

public record IisBinding
{
    public string? Protocol { get; init; }
    public string? BindingInformation { get; init; }
    public string? SslFlags { get; init; }
    public string? CertificateHash { get; init; }
    public string? CertificateStoreName { get; init; }
}

public record IisSite
{
    public string? Name { get; init; }
    public string? Id { get; init; }
    public string? State { get; init; }
    public List<IisBinding> Bindings { get; init; } = [];
}

public record IisData
{
    public List<IisSite> Sites { get; init; } = [];
}

public record CertificateEntry
{
    public required string Thumbprint { get; init; }
    public string? Subject { get; init; }
    public List<string> SanDnsNames { get; init; } = [];
    public string? Issuer { get; init; }
    public DateTimeOffset? NotBefore { get; init; }
    public DateTimeOffset? NotAfter { get; init; }
    public int? KeySize { get; init; }
    public int? DaysUntilExpiry { get; init; }
    public List<string> BoundTo { get; init; } = [];
}

public record CertificatesData
{
    public List<CertificateEntry> Certificates { get; init; } = [];
    public string? RdpQueryError { get; init; }
    public string? HttpSysQueryError { get; init; }
}

public record SqlInstance
{
    public string? InstanceName { get; init; }
    public string? Edition { get; init; }
    public string? Version { get; init; }
    public string? PatchLevel { get; init; }
    public string? SqlBinRoot { get; init; }
    public string? SqlDataRoot { get; init; }
    public string? Collation { get; init; }
    public int? LoginMode { get; init; }
    public string? BackupDirectory { get; init; }
    public string? TcpPort { get; init; }
    public string? TcpDynamicPorts { get; init; }
    public string? ServiceAccount { get; init; }
    public string? ServiceState { get; init; }
    public string? AgentServiceAccount { get; init; }
    public string? AgentServiceState { get; init; }
}

public record SqlServerData
{
    public List<SqlInstance> Instances { get; init; } = [];
}
