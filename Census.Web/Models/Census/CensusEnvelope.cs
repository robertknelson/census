using System;
using System.Collections.Generic;

namespace Census.Web.Models.Census;

public record CensusCategory<T>
{
    public required string Status { get; init; }
    public T Data { get; init; }
    public int DurationMs { get; init; }
    public string Reason { get; init; }
}

public record CensusEnvelope
{
    public int SchemaVersion { get; init; }

    /// <summary>
    /// Which collector payload shape this file holds. Null on files written before
    /// 2026-08-07, when the stamp did not exist — that absence means "unknown shape", not
    /// "the original shape". See census-collector.md 6.5.
    /// </summary>
    public string CollectorVersion { get; init; }

    public required string ComputerName { get; init; }
    public DateTimeOffset CollectedUtc { get; init; }
    public CensusCategory<IdentityData> Identity { get; init; }
    public CensusCategory<MemoryData> Memory { get; init; }
    public CensusCategory<OsData> Os { get; init; }
    public CensusCategory<UpdatesData> Updates { get; init; }
    public CensusCategory<DotnetData> Dotnet { get; init; }
    public CensusCategory<DrivesData> Drives { get; init; }
    public CensusCategory<AppsData> Apps { get; init; }
    public CensusCategory<IisData> Iis { get; init; }
    public CensusCategory<CertificatesData> Certificates { get; init; }
    public CensusCategory<SqlServerData> SqlServer { get; init; }
    public CensusCategory<AliasesData> Aliases { get; init; }
    public required string RequestedName { get; init; }
    public List<string> Roles { get; init; } = [];
}

public record IdentityData
{
    public string Domain { get; init; }
    public string Manufacturer { get; init; }
    public string Model { get; init; }
    public string SmbiosUuid { get; init; }
    public string MachineGuid { get; init; }
    public string BiosSerialNumber { get; init; }
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
    public string ProductName { get; init; }
    public string EditionId { get; init; }
    public string InstallationType { get; init; }
    public string CurrentBuild { get; init; }
    public int Ubr { get; init; }
    public string DisplayVersion { get; init; }
    public string Architecture { get; init; }
    public DateTimeOffset? InstallDate { get; init; }
    public DateTimeOffset? LastBootUpTime { get; init; }
    public bool PendingReboot { get; init; }
    public List<string> PendingRebootReasons { get; init; } = [];
}

public record UpdatesData
{
    public string CurrentBuild { get; init; }
    public int Ubr { get; init; }
    public string LastDetectSuccessTime { get; init; }
    public string LastInstallSuccessTime { get; init; }
}

public record DotnetData
{
    public long? FrameworkReleaseId { get; init; }
    public List<string> CoreRuntimes { get; init; } = [];
    public List<string> Sdks { get; init; } = [];
}

public record DriveEntry
{
    public string DriveLetter { get; init; }
    public string Label { get; init; }
    public string FileSystem { get; init; }
    public string DriveType { get; init; }
    public string HealthStatus { get; init; }
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
    public string DisplayName { get; init; }
    public string DisplayVersion { get; init; }
    public string Publisher { get; init; }
    public string InstallDate { get; init; }
    public string InstallLocation { get; init; }
    public bool SystemComponent { get; init; }
    public string Hive { get; init; }
    public string Architecture { get; init; }
    public string Sid { get; init; }
}

public record AppsData
{
    public int Count { get; init; }
    public List<AppEntry> Entries { get; init; } = [];
}

// applicationHost.config stores paths with %SystemDrive% and friends unexpanded. The pair is
// kept so a variable that could not be expanded stays visible rather than rendering as a path
// that does not resolve.
public record ExpandedPath
{
    public string Raw { get; init; }
    public string Expanded { get; init; }
    public bool Expandable { get; init; } = true;
}

public record IisBinding
{
    public string Protocol { get; init; }
    public string BindingInformation { get; init; }
    public string Ip { get; init; }
    public int? Port { get; init; }
    public string HostHeader { get; init; }
    public bool Parsed { get; init; }
    public string SslFlags { get; init; }
    public string CertificateHash { get; init; }
    public string CertificateStoreName { get; init; }
}

public record IisLogStats
{
    public string EnumerationStatus { get; init; }
    public string Reason { get; init; }
    public string ResolvedDirectory { get; init; }
    public bool Exists { get; init; }
    public int FileCount { get; init; }
    public long TotalBytes { get; init; }
    public DateTimeOffset? OldestUtc { get; init; }
    public DateTimeOffset? NewestUtc { get; init; }
    public long Last24hBytes { get; init; }
    public bool Truncated { get; init; }
    public int EnumerationCap { get; init; }
}

public record IisLogFile
{
    public string Enabled { get; init; }
    public ExpandedPath Directory { get; init; }
    public string DirectorySource { get; init; }
    public string LogFormat { get; init; }
    public string Period { get; init; }
    public string TruncateSize { get; init; }
    public string LogTargetW3C { get; init; }
    public string CentralLogFileMode { get; init; }
    public IisLogStats Stats { get; init; }
}

// No State: applicationHost.config has no state attribute on <site>. Runtime state lives in
// WAS and needs `appcmd list site`, deferred in census-collector.md 8.6.10. ServerAutoStart is
// the config truth; the old State field was null in every payload the collector could produce.
public record IisSite
{
    public string Name { get; init; }
    public string Id { get; init; }
    public string ServerAutoStart { get; init; }
    public ExpandedPath PhysicalPath { get; init; }
    public List<IisBinding> Bindings { get; init; } = [];
    public IisLogFile LogFile { get; init; }
}

public record IisAppPool
{
    public string Name { get; init; }
    public string ManagedRuntimeVersion { get; init; }
    public string ManagedRuntimeVersionSource { get; init; }
    public string ManagedPipelineMode { get; init; }
    public string IdentityType { get; init; }
    public string IdentityTypeSource { get; init; }
    public string UserName { get; init; }
}

public record IisVirtualDirectory
{
    public string Path { get; init; }
    public ExpandedPath PhysicalPath { get; init; }
    public string UserName { get; init; }
    public string LogonMethod { get; init; }
}

public record IisAspNetCore
{
    public string ProcessPath { get; init; }
    public string Arguments { get; init; }
    public string HostingModel { get; init; }
    public Dictionary<string, string> EnvironmentVariables { get; init; } = [];
}

public record IisRuntime
{
    public string PoolManagedRuntimeVersion { get; init; }
    public IisAspNetCore AspNetCore { get; init; }
    public bool HasAppSettingsJson { get; init; }
    public bool HasRuntimeConfigJson { get; init; }
}

public record IisAuthSetting
{
    public bool Enabled { get; init; }
    public string UserName { get; init; }
    public string Source { get; init; }
}

// Anonymous and Windows are independently enableable and commonly both on - they are never
// collapsed into a single "auth mode".
public record IisAuth
{
    public IisAuthSetting AnonymousAuthentication { get; init; }
    public IisAuthSetting WindowsAuthentication { get; init; }
    public IisAuthSetting BasicAuthentication { get; init; }
    public IisAuthSetting DigestAuthentication { get; init; }
}

public record IisApplication
{
    public string SiteName { get; init; }
    public string Path { get; init; }
    public ExpandedPath PhysicalPath { get; init; }
    public string ApplicationPool { get; init; }
    public string PoolManagedRuntimeVersion { get; init; }
    public string PoolManagedPipelineMode { get; init; }
    public string PoolIdentityType { get; init; }
    public string PoolUserName { get; init; }
    public string EnabledProtocols { get; init; }
    public IisRuntime Runtime { get; init; }
    public IisAuth Auth { get; init; }
    public List<IisVirtualDirectory> VirtualDirectories { get; init; } = [];
    public string Status { get; init; }
    public string Reason { get; init; }
}

// One flat collection with a Kind discriminator rather than separate typed lists: it matches
// the payload, keeps a single diff key, and keeps a dependency pivot a single pass.
public record IisDependency
{
    public string SiteName { get; init; }
    public string AppPath { get; init; }
    public string SourceFile { get; init; }
    public string Kind { get; init; }
    public string Name { get; init; }
    public string Host { get; init; }
    public string RawHost { get; init; }
    public bool IsLocal { get; init; }
    public string Sha256 { get; init; }

    // database / file edges
    public string Provider { get; init; }
    public string Instance { get; init; }
    public int? Port { get; init; }
    public string Protocol { get; init; }
    public string FilePath { get; init; }
    public string Database { get; init; }
    public string AuthMode { get; init; }
    public string Encrypt { get; init; }
    public string TrustServerCertificate { get; init; }
    public bool SecretsPresent { get; init; }
    public string ParseStatus { get; init; }

    // http edges
    public string Scheme { get; init; }
    public string Path { get; init; }
    public bool HadCredentials { get; init; }
    public bool HadQuery { get; init; }
}

public record IisServer
{
    public string VersionString { get; init; }
    public int? MajorVersion { get; init; }
    public string PathWwwRoot { get; init; }
    public string ConfigPath { get; init; }
    public DateTimeOffset? ConfigLastWriteUtc { get; init; }
    public string ConfigSha256 { get; init; }
}

public record IisData
{
    public IisServer Server { get; init; }
    public List<IisSite> Sites { get; init; } = [];
    public List<IisAppPool> AppPools { get; init; } = [];
    public List<IisApplication> Applications { get; init; } = [];
    public List<IisDependency> Dependencies { get; init; } = [];
}

public record CertificateEntry
{
    public required string Thumbprint { get; init; }
    public string Subject { get; init; }
    public List<string> SanDnsNames { get; init; } = [];
    public string Issuer { get; init; }
    public DateTimeOffset? NotBefore { get; init; }
    public DateTimeOffset? NotAfter { get; init; }
    public int? KeySize { get; init; }
    public int? DaysUntilExpiry { get; init; }
    public List<string> BoundTo { get; init; } = [];
}

public record CertificatesData
{
    public List<CertificateEntry> Certificates { get; init; } = [];
    public string RdpQueryError { get; init; }
    public string HttpSysQueryError { get; init; }
}

public record SqlInstance
{
    public string InstanceName { get; init; }
    public string Edition { get; init; }
    public string Version { get; init; }
    public string PatchLevel { get; init; }
    public string SqlBinRoot { get; init; }
    public string SqlDataRoot { get; init; }
    public string Collation { get; init; }
    public int? LoginMode { get; init; }
    public string BackupDirectory { get; init; }
    public string TcpPort { get; init; }
    public string TcpDynamicPorts { get; init; }
    public string ServiceAccount { get; init; }
    public string ServiceState { get; init; }
    public string AgentServiceAccount { get; init; }
    public string AgentServiceState { get; init; }

    // Connected data. Registry discovery above always runs; everything below exists only when
    // the collector could open a connection.
    public string ConnectedStatus { get; init; }
    public string ConnectedReason { get; init; }
    public SqlPermissions Permissions { get; init; }
    public SqlServerProperties ServerProperties { get; init; }
    public List<SqlDatabase> Databases { get; init; } = [];
    public List<SqlDatabaseFile> DatabaseFiles { get; init; } = [];
}

// Without ViewAnyDefinition, sys.databases silently returns only what the login can see - a
// short list that looks complete. The reader must render that as a permission failure, never
// as an empty database list.
public record SqlPermissions
{
    public string LoginName { get; init; }
    public bool IsSysadmin { get; init; }
    public bool ViewAnyDefinition { get; init; }
    public bool ViewServerState { get; init; }
}

// Deliberately separate from the registry fields on SqlInstance: Setup's Edition and
// SERVERPROPERTY's Edition are different observations of the same thing and can legitimately
// disagree after a patch. The disagreement is informative; it is not merged away.
public record SqlServerProperties
{
    public string ProductVersion { get; init; }
    public string Edition { get; init; }
    public string ServerCollation { get; init; }
}

public record SqlDatabase
{
    public string Name { get; init; }
    public int? DatabaseId { get; init; }
    public string StateDesc { get; init; }
    public string RecoveryModelDesc { get; init; }
    public int? CompatibilityLevel { get; init; }
    public string CollationName { get; init; }
    public bool IsReadOnly { get; init; }
    public bool IsEncrypted { get; init; }
    public string Owner { get; init; }
    public DateTimeOffset? CreateDate { get; init; }
}

public record SqlDatabaseFile
{
    public string DatabaseName { get; init; }
    public int? FileId { get; init; }
    public string TypeDesc { get; init; }
    public string LogicalName { get; init; }
    public string PhysicalName { get; init; }
    public string Directory { get; init; }
    public long? SizePages { get; init; }
    public long? SizeBytes { get; init; }
    public long? MaxSizePages { get; init; }
    public long? Growth { get; init; }
    public bool IsPercentGrowth { get; init; }
    public bool IsUnc { get; init; }
}

public record SqlServerData
{
    public List<SqlInstance> Instances { get; init; } = [];
}

public record AliasEntry
{
    public string Kind { get; init; }
    public string Value { get; init; }
    public string Source { get; init; }
}

// A derived post-pass: it records which collectors contributed, because an alias set
// assembled while IIS was failing is smaller and that must not read as aliases having been
// removed. See census-collector.md 8.1.1.
public record AliasesData
{
    public List<AliasEntry> Aliases { get; init; } = [];
    public Dictionary<string, string> Sources { get; init; } = [];
}
