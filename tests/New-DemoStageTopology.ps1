<#
    Creates the three-stage WebApp->DB topology: five machines whose only reason to exist is
    the SHAPE of the dependency graph between them.

        DEV   DEVWEBBOX  -- MyWeb   --> MyDB_DEV    on DEVSQLBOX
                         -- YourWeb --> YourDB_DEV  on DEVSQLBOX
        VAL   VALWEBBOX  -- MyWeb   --> MyDB_VAL    on DEVSQLBOX
                         -- YourWeb --> YourDB_VAL  on DEVSQLBOX
        PROD  PRODWEBBOX -- MyWeb   --> MyDB        on PRODSQLBOX
                         -- YourWeb --> YourDB      on PRODSQLBOX

    WHY THIS FIXTURE EXISTS. Four of the six edges land on DEVSQLBOX, which serves DEV and VAL
    both. That box is a single point of failure spanning two stages, and nothing in a
    per-stage mental model shows it - "DEV is DEV, VAL is VAL" is what everyone believes and
    the connection strings say otherwise. Census reads downstream edges; the inversion that
    turns them into blast radius is graph-interop.md 6.1, and HostingController already
    performs it. The fixture supplies edges whose shape makes the inversion say something.

    THE HARDER CASE IT SETS UP. VALWEBBOX -> DEVSQLBOX crosses an asserted stage boundary and
    is CORRECT. PRODWEBBOX -> DEVSQLBOX would be an emergency. The two are structurally
    identical edges, so any rule that separates them must do it by assertion rather than by
    pattern-matching the topology. The sanctioning assertion lives in assets.demo.json:
    DEVSQLBOX is stage ["dev","val"], and multi-valued stage facets are already the
    established mechanism (APPSRV01 is ["dev","qa"], WEB02 is ["prod","staging"]).

    NOTE: this tree contains only the SANCTIONED crossing. The emergency case - a prod app
    pointed at a dev database - is deliberately absent, because it was not part of the
    described estate. It has to be added before any stage-crossing finding can be shown
    failing as well as passing (W-5: output-demo must cover every render branch).

    BASELINE NOISE IS DELIBERATELY ZERO. Every machine carries the fleet-common set; PRODWEBBOX
    also carries URL Rewrite (approved by web-prod: class WebServer + stage prod) and PRODSQLBOX
    also carries SSMS (REQUIRED by db-prod: class DatabaseServer + stage prod). The dev and val
    boxes match neither of those, so the common set alone leaves them clean. No deviations, no
    missing required items - the topology signal is not buried under software findings. Change
    a stage facet and these stop being true, which is the point: the facets are load-bearing.

    RUN ORDER. Standalone. Unlike New-DemoIisData.ps1 / New-DemoSqlData.ps1, which patch
    categories of files that already exist, this script writes whole envelopes for machines
    nothing else touches. It also appends the run-log entries and rewrites the two config
    files, so it is the single source for this slice of the fixture.

    Deterministic: re-running produces byte-identical files. The demo tree is fabricated and
    permanently so (census-web.md 9.6).

    RUN IT UNDER POWERSHELL 7, like the rest of the tree. ConvertTo-Json formats differently
    between editions - 5.1 indents four spaces and renders an empty array across three lines,
    7 indents two and renders `[]` - so running this under Windows PowerShell rewrites all ten
    files with a diff that is pure whitespace. Same-edition re-runs are byte-identical, which
    is the property that matters; the encoding is pinned explicitly below because that one is
    not cosmetic.
#>
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$root = Join-Path $repo 'output-demo'

# ------------------------------------------------------------------------------------------
# shared helpers - same shapes as the other demo generators
# ------------------------------------------------------------------------------------------
# Set-Content -Encoding utf8 means "UTF-8 with BOM" on Windows PowerShell 5.1 and "without" on
# PowerShell 7, so which shell runs this script would decide the bytes on disk. The rest of the
# tree is BOM-free, and on _runs\run-log.jsonl a BOM is not cosmetic: it makes the first line
# fail to deserialize, and CensusStore.GetRunLog counts that as a skipped line and carries on -
# an entry silently missing from coverage and findings. Written through .NET so the encoding is
# stated rather than inherited.
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function WriteText {
    param([string]$Path, [string]$Text)
    [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

function FakeSha {
    param([string]$Seed)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Seed)
        return [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
    }
    finally { $sha.Dispose() }
}

function Nz {
    param($Value)
    if ([string]::IsNullOrEmpty($Value)) { return $null }
    return $Value
}

function Category {
    param($Data, [int]$DurationMs, [string]$Status = 'ok')
    [ordered]@{ status = $Status; data = $Data; durationMs = $DurationMs }
}

function Absent {
    param([string]$Reason, [int]$DurationMs)
    [ordered]@{ status = 'not-present'; reason = $Reason; durationMs = $DurationMs }
}

function Path2 {
    param([string]$Raw, [string]$Expanded, [bool]$Expandable = $true)
    [ordered]@{ raw = $Raw; expanded = $(if ($Expanded) { $Expanded } else { $Raw }); expandable = $Expandable }
}

function Drive {
    param([string]$Letter, [string]$Label, [long]$SizeBytes, [long]$FreeBytes)
    [ordered]@{
        driveLetter  = $Letter
        label        = $Label
        fileSystem   = 'NTFS'
        driveType    = 'Fixed'
        healthStatus = 'Healthy'
        sizeBytes    = $SizeBytes
        freeBytes    = $FreeBytes
        usedBytes    = $SizeBytes - $FreeBytes
        percentFree  = [math]::Round(100 * $FreeBytes / $SizeBytes)
    }
}

function Cert {
    param([string]$Subject, [string[]]$San, [string]$Thumbprint, [string]$NotAfter,
          [int]$DaysUntilExpiry, [string[]]$BoundTo = @())
    [ordered]@{
        subject         = $Subject
        sanDnsNames     = $San
        issuer          = 'CN=Corp Issuing CA 1, DC=corp, DC=example, DC=com'
        thumbprint      = $Thumbprint
        notBefore       = '2025-06-01T00:00:00.0000000-04:00'
        notAfter        = $NotAfter
        keySize         = 2048
        daysUntilExpiry = $DaysUntilExpiry
        boundTo         = $BoundTo
    }
}

function Alias {
    param([string]$Kind, [string]$Value, [string]$Source)
    [ordered]@{ kind = $Kind; value = $Value; source = $Source }
}

function App {
    param([string]$Name, [string]$Version, [string]$Publisher, [string]$Arch = 'x64')
    [ordered]@{
        displayName     = $Name
        displayVersion  = $Version
        publisher       = $Publisher
        installDate     = '20250114'
        installLocation = $null
        systemComponent = $false
        hive            = 'HKLM'
        architecture    = $Arch
        sid             = $null
    }
}

# The fleet-common approved set, carried verbatim so these machines contribute no baseline
# deviations and no missing-required findings (config/baselines.demo.json).
$commonApps = @(
    (App 'Microsoft ODBC Driver 17 for SQL Server' '17.10.6.1' 'Microsoft Corporation'),
    (App 'Symantec Endpoint Protection' '12.1.7454.7000' 'Symantec Corporation')
)

$iisAbsent = 'HKLM:\SOFTWARE\Microsoft\InetStp absent'
$sqlAbsent = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL absent'

# ------------------------------------------------------------------------------------------
# IIS shapes
# ------------------------------------------------------------------------------------------
function Binding {
    param([string]$Protocol, [string]$Info, $Port, [string]$HostHeader, $SslFlags, $Hash)
    [ordered]@{
        protocol = $Protocol; bindingInformation = $Info; ip = '*'; port = $Port
        hostHeader = $HostHeader; parsed = $true; sslFlags = (Nz $SslFlags)
        certificateHash = (Nz $Hash); certificateStoreName = $(if ($Hash) { 'My' } else { $null })
    }
}

function LogFile {
    param([string]$Directory, [int]$Files, [long]$Total, [string]$Newest, [long]$Last24h)
    [ordered]@{
        enabled            = 'true'
        directory          = Path2 '%SystemDrive%\inetpub\logs\LogFiles' $Directory
        directorySource    = 'siteDefaults'
        logFormat          = 'W3C'
        period             = 'Daily'
        truncateSize       = $null
        logTargetW3C       = 'File'
        centralLogFileMode = 'Site'
        stats              = [ordered]@{
            enumerationStatus = 'ok'
            resolvedDirectory = $Directory
            exists            = $true
            fileCount         = $Files
            totalBytes        = $Total
            oldestUtc         = '2026-06-01T00:02:19Z'
            newestUtc         = $Newest
            last24hBytes      = $Last24h
            truncated         = $false
            enumerationCap    = 5000
        }
    }
}

function Auth {
    param([bool]$AnonEnabled, [bool]$WinEnabled)
    [ordered]@{
        anonymousAuthentication = [ordered]@{ enabled = $AnonEnabled; userName = 'IUSR'; source = 'location' }
        windowsAuthentication   = [ordered]@{ enabled = $WinEnabled; userName = $null;  source = 'location' }
    }
}

function Pool {
    param([string]$Name, [string]$Identity, $User)
    [ordered]@{
        name = $Name; managedRuntimeVersion = ''; managedRuntimeVersionSource = 'pool'
        managedPipelineMode = 'Integrated'; identityType = $Identity; identityTypeSource = 'pool'
        userName = (Nz $User)
    }
}

function Site {
    param([string]$Name, [string]$Id, [string]$PhysicalPath, [string]$CertHash,
          [int]$LogFiles, [long]$LogTotal, [string]$LogNewest, [long]$LogLast24h)
    [ordered]@{
        name = $Name; id = $Id; serverAutoStart = 'true'
        physicalPath = Path2 $PhysicalPath $PhysicalPath
        bindings = @(
            (Binding 'http'  "*:80:$Name"  80  $Name $null $null),
            (Binding 'https' "*:443:$Name" 443 $Name '1' $CertHash)
        )
        logFile = LogFile "D:\logs\W3SVC$Id" $LogFiles $LogTotal $LogNewest $LogLast24h
    }
}

# ASP.NET Core in-process, one application at the site root. These are modern apps deployed
# per stage; the runtime is identical across stages by construction, which is what makes a
# runtime-spread row in the Hosting pivot boring here and the dependency rows interesting.
function WebApplication {
    param([string]$SiteName, [string]$PhysicalPath, [string]$PoolName, [string]$PoolUser)
    [ordered]@{
        siteName = $SiteName; path = '/'; physicalPath = Path2 $PhysicalPath $PhysicalPath
        applicationPool = $PoolName; poolManagedRuntimeVersion = ''
        poolManagedPipelineMode = 'Integrated'
        poolIdentityType = $(if ($PoolUser) { 'SpecificUser' } else { 'ApplicationPoolIdentity' })
        poolUserName = (Nz $PoolUser); enabledProtocols = 'http'
        runtime = [ordered]@{
            poolManagedRuntimeVersion = ''
            aspNetCore = [ordered]@{
                processPath          = 'dotnet'
                arguments            = ".\$($PoolName -replace 'Pool$', '').dll"
                hostingModel         = 'inprocess'
                environmentVariables = [ordered]@{}
            }
            hasAppSettingsJson   = $true
            hasRuntimeConfigJson = $true
        }
        auth = Auth $true $false
        virtualDirectories = @(
            [ordered]@{ path = '/'; physicalPath = Path2 $PhysicalPath $PhysicalPath; userName = $null; logonMethod = $null }
        )
        configFiles = [ordered]@{
            webConfig       = [ordered]@{ status = 'ok'; path = "$PhysicalPath\web.config" }
            appSettingsJson = [ordered]@{ status = 'ok'; path = "$PhysicalPath\appsettings.json" }
        }
        status = 'ok'
    }
}

# The edge that carries the whole point of this fixture. No `instance` is given: these connect
# to the default instance, which is both the common real case and the path through
# HostingController.Corroborate where every instance on the target is a candidate.
function DbEdge {
    param([string]$Site, [string]$Name, [string]$DbHost, [string]$Database)
    [ordered]@{
        siteName = $Site; appPath = '/'; sourceFile = 'appsettings.json'; kind = 'database'; name = $Name
        host = $DbHost; rawHost = $DbHost; isLocal = $false; instance = $null; port = 1433
        protocol = $null; filePath = $null; database = $Database; authMode = 'integrated'
        provider = 'Microsoft.Data.SqlClient'; encrypt = 'true'; trustServerCertificate = 'false'
        secretsPresent = $false; parseStatus = 'ok'
        sha256 = FakeSha "$Site|/|appsettings.json|$Name|$DbHost|$Database"
    }
}

function IisServer {
    param([string]$Written, [string]$Seed)
    [ordered]@{
        versionString = '10.0.20348.1'; majorVersion = 10; pathWwwRoot = 'C:\inetpub\wwwroot'
        configPath = 'C:\Windows\System32\inetsrv\config\applicationHost.config'
        configLastWriteUtc = $Written; configSha256 = FakeSha $Seed
    }
}

# ------------------------------------------------------------------------------------------
# SQL shapes
# ------------------------------------------------------------------------------------------
function Db {
    param([string]$Name, [int]$Id, [string]$Recovery = 'FULL', [string]$Created = '2025-02-18T10:22:41.4470000-05:00')
    [ordered]@{
        name               = $Name
        databaseId         = $Id
        stateDesc          = 'ONLINE'
        recoveryModelDesc  = $Recovery
        compatibilityLevel = 160
        collationName      = 'SQL_Latin1_General_CP1_CI_AS'
        isReadOnly         = $false
        isEncrypted        = $false
        owner              = 'sa'
        createDate         = $Created
    }
}

function DbFile {
    param([string]$Database, [int]$FileId, [string]$Type, [string]$Logical, [string]$Physical, [long]$SizePages)
    [ordered]@{
        databaseName    = $Database
        fileId          = $FileId
        typeDesc        = $Type
        logicalName     = $Logical
        physicalName    = $Physical
        directory       = Split-Path -Parent $Physical
        sizePages       = $SizePages
        sizeBytes       = [int64]$SizePages * 8192
        maxSizePages    = -1
        growth          = 65536
        isPercentGrowth = $false
        isUnc           = $false
    }
}

$sysDataDir = 'C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\DATA'
$systemDatabases = @(
    (Db 'master' 1 'SIMPLE' '2023-04-11T07:15:02.1000000-04:00'),
    (Db 'tempdb' 2 'SIMPLE' '2026-07-31T02:05:00.0000000-04:00'),
    (Db 'model'  3 'FULL'   '2023-04-11T07:15:02.1000000-04:00'),
    (Db 'msdb'   4 'SIMPLE' '2023-04-11T07:15:02.1000000-04:00')
)
$systemFiles = @(
    (DbFile 'master' 1 'ROWS' 'master'   "$sysDataDir\master.mdf"   1024),
    (DbFile 'master' 2 'LOG'  'mastlog'  "$sysDataDir\mastlog.ldf"   256),
    (DbFile 'tempdb' 1 'ROWS' 'tempdev'  "$sysDataDir\tempdb.mdf"   8192),
    (DbFile 'tempdb' 2 'LOG'  'templog'  "$sysDataDir\templog.ldf"  2048),
    (DbFile 'model'  1 'ROWS' 'modeldev' "$sysDataDir\model.mdf"     512),
    (DbFile 'model'  2 'LOG'  'modellog' "$sysDataDir\modellog.ldf"  256),
    (DbFile 'msdb'   1 'ROWS' 'MSDBData' "$sysDataDir\MSDBData.mdf" 2376),
    (DbFile 'msdb'   2 'LOG'  'MSDBLog'  "$sysDataDir\MSDBLog.ldf"  1024)
)

function SqlInstance {
    param($Databases, $Files, [string]$Backup)
    [ordered]@{
        instanceName = 'MSSQLSERVER'; edition = 'Standard Edition'; version = '16.0.1000.6'
        patchLevel = '16.0.4165.4'
        sqlBinRoot = 'C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\Binn'
        sqlDataRoot = 'C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL'
        collation = 'SQL_Latin1_General_CP1_CI_AS'; loginMode = 2
        backupDirectory = $Backup; tcpPort = '1433'; tcpDynamicPorts = $null
        serviceAccount = 'CORP\svc-sql'; serviceState = 'Running'
        agentServiceAccount = 'CORP\svc-sqlagent'; agentServiceState = 'Running'
        connectedStatus = 'ok'; connectedReason = $null
        permissions = [ordered]@{
            loginName = 'CORP\svc-census'; isSysadmin = $false
            viewAnyDefinition = $true; viewServerState = $true
        }
        serverProperties = [ordered]@{
            productVersion = '16.0.4165.4'; edition = 'Standard Edition (64-bit)'
            serverCollation = 'SQL_Latin1_General_CP1_CI_AS'
        }
        databases = $Databases
        databaseFiles = $Files
    }
}

# DEVSQLBOX - four databases, two stages. This is the shared box the whole fixture is about.
$devDatabases = $systemDatabases + @(
    (Db 'MyDB_DEV'   5 'SIMPLE'),
    (Db 'MyDB_VAL'   6 'FULL'),
    (Db 'YourDB_DEV' 7 'SIMPLE'),
    (Db 'YourDB_VAL' 8 'FULL')
)
$devFiles = $systemFiles + @(
    (DbFile 'MyDB_DEV'   1 'ROWS' 'MyDB_DEV'       'D:\sqldata\MyDB_DEV.mdf'         65536),
    (DbFile 'MyDB_DEV'   2 'LOG'  'MyDB_DEV_log'   'L:\sqllogs\MyDB_DEV_log.ldf'     16384),
    (DbFile 'MyDB_VAL'   1 'ROWS' 'MyDB_VAL'       'D:\sqldata\MyDB_VAL.mdf'        131072),
    (DbFile 'MyDB_VAL'   2 'LOG'  'MyDB_VAL_log'   'L:\sqllogs\MyDB_VAL_log.ldf'     32768),
    (DbFile 'YourDB_DEV' 1 'ROWS' 'YourDB_DEV'     'D:\sqldata\YourDB_DEV.mdf'       49152),
    (DbFile 'YourDB_DEV' 2 'LOG'  'YourDB_DEV_log' 'L:\sqllogs\YourDB_DEV_log.ldf'   16384),
    (DbFile 'YourDB_VAL' 1 'ROWS' 'YourDB_VAL'     'D:\sqldata\YourDB_VAL.mdf'       98304),
    (DbFile 'YourDB_VAL' 2 'LOG'  'YourDB_VAL_log' 'L:\sqllogs\YourDB_VAL_log.ldf'   32768)
)

$prodDatabases = $systemDatabases + @(
    (Db 'MyDB'   5 'FULL'),
    (Db 'YourDB' 6 'FULL')
)
$prodFiles = $systemFiles + @(
    (DbFile 'MyDB'   1 'ROWS' 'MyDB'       'D:\sqldata\MyDB.mdf'          786432),
    (DbFile 'MyDB'   2 'LOG'  'MyDB_log'   'L:\sqllogs\MyDB_log.ldf'      196608),
    (DbFile 'YourDB' 1 'ROWS' 'YourDB'     'D:\sqldata\YourDB.mdf'        524288),
    (DbFile 'YourDB' 2 'LOG'  'YourDB_log' 'L:\sqllogs\YourDB_log.ldf'    131072)
)

# ------------------------------------------------------------------------------------------
# envelopes
# ------------------------------------------------------------------------------------------
$aliasSourcesWeb = [ordered]@{ identity = 'ok'; sqlserver = 'not-present'; iis = 'ok'; certificates = 'ok'; network = 'ok' }
$aliasSourcesSql = [ordered]@{ identity = 'ok'; sqlserver = 'ok'; iis = 'not-present'; certificates = 'ok'; network = 'ok' }

function WebEnvelope {
    param([string]$Name, [string]$Ipv4, [string]$Guid, [string]$Smbios, [string]$Serial,
          [string]$MyHost, [string]$YourHost, [string]$SqlHost,
          [string]$MyDb, [string]$YourDb, $ExtraApps,
          [string]$CollectedUtc, [int]$Ubr, [long]$CFree, [int]$LogFiles, [long]$LogTotal)

    $lower = $Name.ToLowerInvariant()
    $myCertHash   = (FakeSha "cert|$MyHost").Substring(0, 40).ToUpperInvariant()
    $yourCertHash = (FakeSha "cert|$YourHost").Substring(0, 40).ToUpperInvariant()

    [ordered]@{
        schemaVersion    = 1
        collectorVersion = '1.0.0'
        computerName     = $Name
        collectedUtc     = $CollectedUtc
        identity = Category ([ordered]@{
            domain               = 'corp.example.com'
            manufacturer         = 'Microsoft Corporation'
            model                = 'Virtual Machine'
            smbiosUuid           = $Smbios
            machineGuid          = $Guid
            biosSerialNumber     = $Serial
            isVirtual            = $true
            hypervisorSignals    = @('Hyper-V')
            cpuSockets           = 1
            cpuCores             = 4
            cpuLogicalProcessors = 8
        }) 279
        memory = Category ([ordered]@{ totalPhysicalMemoryBytes = 17179869184; totalPhysicalMemoryGB = 16 }) 8
        os = Category ([ordered]@{
            productName          = 'Windows Server 2022 Standard'
            editionId            = 'ServerStandard'
            installationType     = 'Server'
            currentBuild         = '20348'
            ubr                  = $Ubr
            displayVersion       = '21H2'
            architecture         = '64-bit'
            installDate          = '2024-09-03T13:40:00.0000000-04:00'
            lastBootUpTime       = '2026-07-12T03:05:00.0000000-04:00'
            pendingReboot        = $false
            pendingRebootReasons = @()
        }) 88
        updates = Category ([ordered]@{
            currentBuild           = '20348'
            ubr                    = $Ubr
            lastDetectSuccessTime  = '2026-07-30 02:10:00'
            lastInstallSuccessTime = '2026-07-14 03:05:00'
        }) 39
        dotnet = Category ([ordered]@{
            frameworkReleaseId = 533320
            coreRuntimes       = @(
                'Microsoft.AspNetCore.App 8.0.27 [C:\Program Files\dotnet\shared\Microsoft.AspNetCore.App]',
                'Microsoft.NETCore.App 8.0.27 [C:\Program Files\dotnet\shared\Microsoft.NETCore.App]'
            )
            sdks               = @()
        }) 42
        drives = Category ([ordered]@{ drives = @(
            (Drive 'C' 'OS'   107374182400 $CFree),
            (Drive 'D' 'Web'  214748364800 161061273600)
        ) }) 218
        apps = Category ([ordered]@{
            count   = $commonApps.Count + $ExtraApps.Count
            entries = $commonApps + $ExtraApps
        }) 690
        iis = Category ([ordered]@{
            server = IisServer '2026-07-02T10:14:07Z' "iis|$Name"
            sites  = @(
                (Site $MyHost   '2' "D:\sites\MyWeb"   $myCertHash   $LogFiles $LogTotal '2026-07-31T23:58:00Z' 4096),
                (Site $YourHost '3' "D:\sites\YourWeb" $yourCertHash $LogFiles $LogTotal '2026-07-31T23:57:00Z' 3072)
            )
            appPools = @(
                (Pool 'MyWebPool'   'SpecificUser' 'CORP\svc-myweb'),
                (Pool 'YourWebPool' 'ApplicationPoolIdentity' $null)
            )
            applications = @(
                (WebApplication $MyHost   "D:\sites\MyWeb"   'MyWebPool'   'CORP\svc-myweb'),
                (WebApplication $YourHost "D:\sites\YourWeb" 'YourWebPool' $null)
            )
            dependencies = @(
                (DbEdge $MyHost   'MyDb'   $SqlHost $MyDb),
                (DbEdge $YourHost 'YourDb' $SqlHost $YourDb)
            )
        }) 1180
        certificates = Category ([ordered]@{
            certificates = @(
                (Cert "CN=$MyHost"   @($MyHost)   $myCertHash   '2027-06-01T00:00:00.0000000-04:00' 288 @("${MyHost}:443")),
                (Cert "CN=$YourHost" @($YourHost) $yourCertHash '2027-06-01T00:00:00.0000000-04:00' 288 @("${YourHost}:443"))
            )
            rdpQueryError     = $null
            httpSysQueryError = $null
        }) 58
        sqlServer = Absent $sqlAbsent 4
        aliases = Category ([ordered]@{
            aliases = @(
                (Alias 'netbios' $Name 'identity'),
                (Alias 'fqdn' "$lower.corp.example.com" 'identity'),
                (Alias 'machineGuid' $Guid 'identity'),
                (Alias 'ipv4' $Ipv4 'network'),
                (Alias 'bindingHostHeader' $MyHost 'iis'),
                (Alias 'bindingHostHeader' $YourHost 'iis'),
                (Alias 'certSan' $MyHost 'certificates')
            )
            sources = $aliasSourcesWeb
        }) 40
        requestedName = $lower
        roles         = @('WebServer')
    }
}

function SqlEnvelope {
    param([string]$Name, [string]$Ipv4, [string]$Guid, [string]$Smbios, [string]$Serial,
          $Databases, $Files, [string]$Backup, $ExtraApps,
          [string]$CollectedUtc, [int]$Ubr, [long]$DFree)

    $lower = $Name.ToLowerInvariant()
    [ordered]@{
        schemaVersion    = 1
        collectorVersion = '1.0.0'
        computerName     = $Name
        collectedUtc     = $CollectedUtc
        identity = Category ([ordered]@{
            domain               = 'corp.example.com'
            manufacturer         = 'Microsoft Corporation'
            model                = 'Virtual Machine'
            smbiosUuid           = $Smbios
            machineGuid          = $Guid
            biosSerialNumber     = $Serial
            isVirtual            = $true
            hypervisorSignals    = @('Hyper-V')
            cpuSockets           = 1
            cpuCores             = 8
            cpuLogicalProcessors = 16
        }) 294
        memory = Category ([ordered]@{ totalPhysicalMemoryBytes = 68719476736; totalPhysicalMemoryGB = 64 }) 10
        os = Category ([ordered]@{
            productName          = 'Windows Server 2022 Standard'
            editionId            = 'ServerStandard'
            installationType     = 'Server'
            currentBuild         = '20348'
            ubr                  = $Ubr
            displayVersion       = '21H2'
            architecture         = '64-bit'
            installDate          = '2024-08-21T08:55:00.0000000-04:00'
            lastBootUpTime       = '2026-07-12T03:20:00.0000000-04:00'
            pendingReboot        = $false
            pendingRebootReasons = @()
        }) 93
        updates = Category ([ordered]@{
            currentBuild           = '20348'
            ubr                    = $Ubr
            lastDetectSuccessTime  = '2026-07-30 02:25:00'
            lastInstallSuccessTime = '2026-07-14 03:05:00'
        }) 44
        dotnet = Category ([ordered]@{
            frameworkReleaseId = 533320
            coreRuntimes       = @()
            sdks               = @()
        }) 37
        drives = Category ([ordered]@{ drives = @(
            (Drive 'C' 'OS'      107374182400 42949672960),
            (Drive 'D' 'SQLData' 1099511627776 $DFree),
            (Drive 'L' 'SQLLogs' 274877906944 219902325555)
        ) }) 244
        apps = Category ([ordered]@{
            count   = $commonApps.Count + $ExtraApps.Count
            entries = $commonApps + $ExtraApps
        }) 705
        iis = Absent $iisAbsent 5
        certificates = Category ([ordered]@{
            certificates      = @()
            rdpQueryError     = $null
            httpSysQueryError = $null
        }) 39
        sqlServer = Category ([ordered]@{
            instances = @((SqlInstance $Databases $Files $Backup))
        }) 2410
        aliases = Category ([ordered]@{
            aliases = @(
                (Alias 'netbios' $Name 'identity'),
                (Alias 'fqdn' "$lower.corp.example.com" 'identity'),
                (Alias 'machineGuid' $Guid 'identity'),
                (Alias 'ipv4' $Ipv4 'network')
            )
            sources = $aliasSourcesSql
        }) 38
        requestedName = $lower
        roles         = @('DatabaseServer')
    }
}

# ------------------------------------------------------------------------------------------
# targets - two snapshots each, matching the fixture cadence. Day 2 differs in UBR and free
# space so the changes feed and the machine history have something to render; the dependency
# edges are deliberately IDENTICAL across both days, because a topology that churns daily
# would make the diff the story instead of the shape.
# ------------------------------------------------------------------------------------------
# PRODWEBBOX matches web-prod (class WebServer + stage prod), which approves URL Rewrite;
# PRODSQLBOX matches db-prod, which REQUIRES SSMS. Both are carried so neither machine
# reports a baseline finding - see the header note on zero baseline noise. The dev and val
# boxes match neither, so they carry the fleet-common set alone.
$urlRewrite = @((App 'URL Rewrite 2.1' '7.2.2100' 'Microsoft Corporation'))
$ssms       = @((App 'SQL Server 2019 Management Studio' '19.3.0' 'Microsoft Corporation'))

# The 20348 patch line's high-water mark is WEB01 at 3807. These five sit at the mark on their
# latest snapshot so they carry no behind-fleet-patch finding - a fixture built to demonstrate
# one thing should not arrive pre-degraded for an unrelated reason. Day 1 trails, which is what
# gives the changes feed an os.build change to render.
#
# This couples the fixture to WEB01: raise WEB01's ubr and these five start reporting behind.
# That is the finding working correctly, not a defect here - but it is why the number is named
# once rather than typed ten times.
$ubrDay1 = 3630
$ubrDay2 = 3807

$targets = @(
    @{ File = 'DEVWEBBOX\devwebbox-census-20260730.json'
       Envelope = WebEnvelope 'DEVWEBBOX' '10.0.1.10' 'd1e2f3a4-5b60-4712-8c3d-4e5f60718a01' `
           '4c4c4544-1001-3610-8052-b7c04f560001' 'DEVWEB01' `
           'myweb.dev.example.com' 'yourweb.dev.example.com' 'DEVSQLBOX' 'MyDB_DEV' 'YourDB_DEV' @() `
           '2026-07-30T03:20:11.0000000Z' $ubrDay1 64424509440 12 18432 }
    @{ File = 'DEVWEBBOX\devwebbox-census-20260731.json'
       Envelope = WebEnvelope 'DEVWEBBOX' '10.0.1.10' 'd1e2f3a4-5b60-4712-8c3d-4e5f60718a01' `
           '4c4c4544-1001-3610-8052-b7c04f560001' 'DEVWEB01' `
           'myweb.dev.example.com' 'yourweb.dev.example.com' 'DEVSQLBOX' 'MyDB_DEV' 'YourDB_DEV' @() `
           '2026-07-31T03:20:38.0000000Z' $ubrDay2 61203283968 13 20480 }

    @{ File = 'VALWEBBOX\valwebbox-census-20260730.json'
       Envelope = WebEnvelope 'VALWEBBOX' '10.0.1.11' 'e2f3a4b5-6c71-4823-9d4e-5f60718a9b02' `
           '4c4c4544-1002-3610-8052-b7c04f560002' 'VALWEB01' `
           'myweb.val.example.com' 'yourweb.val.example.com' 'DEVSQLBOX' 'MyDB_VAL' 'YourDB_VAL' @() `
           '2026-07-30T03:22:04.0000000Z' $ubrDay1 59055800320 9 13312 }
    @{ File = 'VALWEBBOX\valwebbox-census-20260731.json'
       Envelope = WebEnvelope 'VALWEBBOX' '10.0.1.11' 'e2f3a4b5-6c71-4823-9d4e-5f60718a9b02' `
           '4c4c4544-1002-3610-8052-b7c04f560002' 'VALWEB01' `
           'myweb.val.example.com' 'yourweb.val.example.com' 'DEVSQLBOX' 'MyDB_VAL' 'YourDB_VAL' @() `
           '2026-07-31T03:22:29.0000000Z' $ubrDay2 57042534400 10 15360 }

    @{ File = 'PRODWEBBOX\prodwebbox-census-20260730.json'
       Envelope = WebEnvelope 'PRODWEBBOX' '10.0.1.12' 'f3a4b5c6-7d82-4934-ae5f-60718a9bac03' `
           '4c4c4544-1003-3610-8052-b7c04f560003' 'PRODWEB01' `
           'myweb.example.com' 'yourweb.example.com' 'PRODSQLBOX' 'MyDB' 'YourDB' $urlRewrite `
           '2026-07-30T03:24:47.0000000Z' $ubrDay1 51539607552 41 96256 }
    @{ File = 'PRODWEBBOX\prodwebbox-census-20260731.json'
       Envelope = WebEnvelope 'PRODWEBBOX' '10.0.1.12' 'f3a4b5c6-7d82-4934-ae5f-60718a9bac03' `
           '4c4c4544-1003-3610-8052-b7c04f560003' 'PRODWEB01' `
           'myweb.example.com' 'yourweb.example.com' 'PRODSQLBOX' 'MyDB' 'YourDB' $urlRewrite `
           '2026-07-31T03:25:12.0000000Z' $ubrDay2 48318382080 43 101376 }

    @{ File = 'DEVSQLBOX\devsqlbox-census-20260730.json'
       Envelope = SqlEnvelope 'DEVSQLBOX' '10.0.1.20' 'a4b5c6d7-8e93-4a45-bf60-718a9bacbd04' `
           '4c4c4544-1004-3610-8052-b7c04f560004' 'DEVSQL01' `
           $devDatabases $devFiles '\\fs01\sqlbackups\DEVSQLBOX' @() `
           '2026-07-30T02:55:18.0000000Z' $ubrDay1 769656197120 }
    @{ File = 'DEVSQLBOX\devsqlbox-census-20260731.json'
       Envelope = SqlEnvelope 'DEVSQLBOX' '10.0.1.20' 'a4b5c6d7-8e93-4a45-bf60-718a9bacbd04' `
           '4c4c4544-1004-3610-8052-b7c04f560004' 'DEVSQL01' `
           $devDatabases $devFiles '\\fs01\sqlbackups\DEVSQLBOX' @() `
           '2026-07-31T02:55:44.0000000Z' $ubrDay2 756350058496 }

    @{ File = 'PRODSQLBOX\prodsqlbox-census-20260730.json'
       Envelope = SqlEnvelope 'PRODSQLBOX' '10.0.1.21' 'b5c6d7e8-9fa4-4b56-c071-8a9bacbdce05' `
           '4c4c4544-1005-3610-8052-b7c04f560005' 'PRODSQL01' `
           $prodDatabases $prodFiles '\\fs01\sqlbackups\PRODSQLBOX' $ssms `
           '2026-07-30T02:58:31.0000000Z' $ubrDay1 604462909807 }
    @{ File = 'PRODSQLBOX\prodsqlbox-census-20260731.json'
       Envelope = SqlEnvelope 'PRODSQLBOX' '10.0.1.21' 'b5c6d7e8-9fa4-4b56-c071-8a9bacbdce05' `
           '4c4c4544-1005-3610-8052-b7c04f560005' 'PRODSQL01' `
           $prodDatabases $prodFiles '\\fs01\sqlbackups\PRODSQLBOX' $ssms `
           '2026-07-31T02:58:59.0000000Z' $ubrDay2 591256977408 }
)

foreach ($target in $targets) {
    $path = Join-Path $root $target.File
    $dir = Split-Path -Parent $path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    WriteText $path (($target.Envelope | ConvertTo-Json -Depth 20) + "`r`n")
    Write-Host "wrote $($target.File)"
}

# ------------------------------------------------------------------------------------------
# run log - without an 'ok' entry each machine reports never-collected/unlogged-collection,
# which would bury the topology signal under coverage findings. Entries go in the
# pre-rotation file because that is where 07-30 and 07-31 already live (snapshot-aging.md 5).
# ------------------------------------------------------------------------------------------
$runLogPath = Join-Path $root '_runs\run-log.jsonl'
$existing = @(Get-Content -LiteralPath $runLogPath | Where-Object { $_.Trim() })

$runs = @(
    @{ M = 'devwebbox';  S = '2026-07-30T03:19:48.0000000Z'; F = '2026-07-30T03:20:11.0000000Z'; D = 22890 }
    @{ M = 'valwebbox';  S = '2026-07-30T03:21:41.0000000Z'; F = '2026-07-30T03:22:04.0000000Z'; D = 22610 }
    @{ M = 'prodwebbox'; S = '2026-07-30T03:24:22.0000000Z'; F = '2026-07-30T03:24:47.0000000Z'; D = 25040 }
    @{ M = 'devsqlbox';  S = '2026-07-30T02:54:49.0000000Z'; F = '2026-07-30T02:55:18.0000000Z'; D = 29110 }
    @{ M = 'prodsqlbox'; S = '2026-07-30T02:58:03.0000000Z'; F = '2026-07-30T02:58:31.0000000Z'; D = 28330 }
    @{ M = 'devwebbox';  S = '2026-07-31T03:20:15.0000000Z'; F = '2026-07-31T03:20:38.0000000Z'; D = 23120 }
    @{ M = 'valwebbox';  S = '2026-07-31T03:22:06.0000000Z'; F = '2026-07-31T03:22:29.0000000Z'; D = 22940 }
    @{ M = 'prodwebbox'; S = '2026-07-31T03:24:46.0000000Z'; F = '2026-07-31T03:25:12.0000000Z'; D = 25510 }
    @{ M = 'devsqlbox';  S = '2026-07-31T02:55:14.0000000Z'; F = '2026-07-31T02:55:44.0000000Z'; D = 29680 }
    @{ M = 'prodsqlbox'; S = '2026-07-31T02:58:30.0000000Z'; F = '2026-07-31T02:58:59.0000000Z'; D = 28870 }
)

# Idempotent: re-running must not append a second copy of the same entries.
$stageMachines = @('devwebbox', 'valwebbox', 'prodwebbox', 'devsqlbox', 'prodsqlbox')
$kept = $existing | Where-Object {
    $entry = $_ | ConvertFrom-Json
    $stageMachines -notcontains $entry.machine
}

$added = foreach ($run in $runs) {
    [ordered]@{
        machine          = $run.M
        collectorVersion = '1.0.0'
        bucket           = 'corp'
        outcome          = 'ok'
        reason           = $null
        startedUtc       = $run.S
        finishedUtc      = $run.F
        durationMs       = $run.D
    } | ConvertTo-Json -Compress -Depth 5
}

# The collector appends with Add-Content: one entry per line, trailing newline, no BOM.
WriteText $runLogPath (((@($kept) + @($added)) -join "`r`n") + "`r`n")
Write-Host "wrote _runs\run-log.jsonl ($(@($kept).Count) kept, $(@($added).Count) added)"

Write-Host ''
Write-Host 'Remember: config/machines.demo.json and config/assets.demo.json carry the'
Write-Host 'stage assertions for these machines. DEVSQLBOX must stay stage ["dev","val"] -'
Write-Host 'that assertion is what makes VALWEBBOX -> DEVSQLBOX sanctioned rather than a fault.'
