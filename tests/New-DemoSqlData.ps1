<#
    Regenerates the `sqlserver` category in output-demo/ to the v2 payload shape
    (census-collector.md 8.8.1). Fabricated and permanently so (census-web.md 9.6/10.5) -
    no real SQL run against a production estate is reachable from this environment.

    Every branch the dossier has to render is covered deliberately; see the coverage
    checklist in census-web.md 10.5. Deterministic: re-running produces byte-identical files.
#>
$ErrorActionPreference = 'Stop'
$root = Join-Path (Split-Path -Parent $PSScriptRoot) 'output-demo'

function Nz {
    param($Value)
    if ([string]::IsNullOrEmpty($Value)) { return $null }
    return $Value
}

function Db {
    param([string]$Name, [int]$Id, [string]$State = 'ONLINE', [string]$Recovery = 'FULL',
          [int]$Compat = 160, [string]$Owner = 'sa', [bool]$ReadOnly = $false,
          [bool]$Encrypted = $false, [string]$Created = '2024-03-11T09:14:02.1130000-04:00')
    [ordered]@{
        name               = $Name
        databaseId         = $Id
        stateDesc          = $State
        recoveryModelDesc  = $Recovery
        compatibilityLevel = $Compat
        collationName      = 'SQL_Latin1_General_CP1_CI_AS'
        isReadOnly         = $ReadOnly
        isEncrypted        = $Encrypted
        owner              = $Owner
        createDate         = $Created
    }
}

function DbFile {
    param([string]$Database, [int]$FileId, [string]$Type, [string]$Logical, [string]$Physical,
          [long]$SizePages, [long]$MaxSize = -1, [long]$Growth = 65536, [bool]$PercentGrowth = $false)
    [ordered]@{
        databaseName    = $Database
        fileId          = $FileId
        typeDesc        = $Type
        logicalName     = $Logical
        physicalName    = $Physical
        directory       = Split-Path -Parent $Physical
        sizePages       = $SizePages
        sizeBytes       = [int64]$SizePages * 8192
        maxSizePages    = $MaxSize
        growth          = $Growth
        isPercentGrowth = $PercentGrowth
        isUnc           = $Physical.StartsWith('\\')
    }
}

function Perms {
    param([string]$Login, [bool]$Sysadmin = $true, [bool]$ViewAnyDefinition = $true, [bool]$ViewServerState = $true)
    [ordered]@{
        loginName         = $Login
        isSysadmin        = $Sysadmin
        viewAnyDefinition = $ViewAnyDefinition
        viewServerState   = $ViewServerState
    }
}

$systemDatabases = @(
    (Db 'master' 1 'ONLINE' 'SIMPLE' 160 'sa' $false $false '2022-10-08T06:31:57.5500000-04:00'),
    (Db 'tempdb' 2 'ONLINE' 'SIMPLE' 160 'sa' $false $false '2026-07-31T02:10:44.0000000-04:00'),
    (Db 'model'  3 'ONLINE' 'FULL'   160 'sa' $false $false '2022-10-08T06:31:57.5500000-04:00'),
    (Db 'msdb'   4 'ONLINE' 'SIMPLE' 160 'sa' $false $false '2022-10-08T06:31:57.5500000-04:00')
)
$dataDir = 'C:\Program Files\Microsoft SQL Server\MSSQL15.PROD\MSSQL\DATA'
$systemFiles = @(
    (DbFile 'master' 1 'ROWS' 'master'   "$dataDir\master.mdf"   1024 -1 10 $true),
    (DbFile 'master' 2 'LOG'  'mastlog'  "$dataDir\mastlog.ldf"   256 -1 10 $true),
    (DbFile 'tempdb' 1 'ROWS' 'tempdev'  "$dataDir\tempdb.mdf"   8192 -1 65536),
    (DbFile 'tempdb' 2 'LOG'  'templog'  "$dataDir\templog.ldf"  2048 -1 65536),
    (DbFile 'model'  1 'ROWS' 'modeldev' "$dataDir\model.mdf"     512 -1 65536),
    (DbFile 'model'  2 'LOG'  'modellog' "$dataDir\modellog.ldf"  256 -1 65536),
    (DbFile 'msdb'   1 'ROWS' 'MSDBData' "$dataDir\MSDBData.mdf" 2376 -1 10 $true),
    (DbFile 'msdb'   2 'LOG'  'MSDBLog'  "$dataDir\MSDBLog.ldf"  1024 -1 10 $true)
)

# SQL01\PROD - full rights. Covers ONLINE + OFFLINE, SIMPLE + FULL recovery, a personal-account
# owner, an encrypted database, data and log on separate volumes, and one file on a UNC path.
$prodDatabases = $systemDatabases + @(
    (Db 'Portal'     5 'ONLINE'  'FULL'   160 'sa'),
    (Db 'Reporting'  6 'ONLINE'  'SIMPLE' 150 'CORP\jsmith'),
    (Db 'Billing'    7 'ONLINE'  'FULL'   160 'sa' $false $true),
    (Db 'PortalArch' 8 'ONLINE'  'SIMPLE' 140 'sa' $true),
    # LegacyCRM comes back ONLINE on day 2 to drive the state diff, so a second permanently
    # offline database is needed - otherwise the latest snapshot, which is what the estate
    # renders, would contain no non-ONLINE database and that branch would never be seen.
    (Db 'LegacyCRM'  9 'OFFLINE' 'FULL'   100 'CORP\jsmith'),
    (Db 'RetiredHR' 10 'OFFLINE' 'SIMPLE' 100 'sa')
)
$prodFiles = $systemFiles + @(
    (DbFile 'Portal'     1 'ROWS' 'Portal'      'D:\sqldata\Portal.mdf'            524288 -1 262144),
    (DbFile 'Portal'     2 'LOG'  'Portal_log'  'E:\sqllogs\Portal_log.ldf'        131072 -1 131072),
    (DbFile 'Reporting'  1 'ROWS' 'Reporting'   'D:\sqldata\Reporting.mdf'        1310720 -1 262144),
    (DbFile 'Reporting'  2 'LOG'  'Reporting_log' 'E:\sqllogs\Reporting_log.ldf'    65536 -1 131072),
    (DbFile 'Billing'    1 'ROWS' 'Billing'     'D:\sqldata\Billing.mdf'           262144 -1 262144),
    (DbFile 'Billing'    2 'LOG'  'Billing_log' 'E:\sqllogs\Billing_log.ldf'        65536 -1 131072),
    (DbFile 'PortalArch' 1 'ROWS' 'PortalArch'  '\\fs01\sqlarchive\PortalArch.mdf' 2097152 -1 262144),
    (DbFile 'PortalArch' 2 'LOG'  'PortalArch_log' 'E:\sqllogs\PortalArch_log.ldf'  32768 -1 131072),
    (DbFile 'LegacyCRM'  1 'ROWS' 'LegacyCRM'   'D:\sqldata\LegacyCRM.mdf'          98304 -1 10 $true),
    (DbFile 'LegacyCRM'  2 'LOG'  'LegacyCRM_log' 'E:\sqllogs\LegacyCRM_log.ldf'    16384 -1 10 $true),
    # An offline database still contributes its files - that is why no per-database loop is
    # needed (census-collector.md 8.8.1).
    (DbFile 'RetiredHR'  1 'ROWS' 'RetiredHR'   'D:\sqldata\RetiredHR.mdf'          40960 -1 10 $true),
    (DbFile 'RetiredHR'  2 'LOG'  'RetiredHR_log' 'E:\sqllogs\RetiredHR_log.ldf'     8192 -1 10 $true)
)

$sql01Instances = @(
    [ordered]@{
        instanceName = 'PROD'; edition = 'Enterprise Edition'; version = '15.0.2000.5'
        patchLevel = '15.0.4335.1'; sqlBinRoot = 'C:\Program Files\Microsoft SQL Server\MSSQL15.PROD\MSSQL\Binn'
        sqlDataRoot = 'C:\Program Files\Microsoft SQL Server\MSSQL15.PROD\MSSQL'
        collation = 'SQL_Latin1_General_CP1_CI_AS'; loginMode = 2
        backupDirectory = '\\fs01\sqlbackups\SQL01'; tcpPort = '1433'; tcpDynamicPorts = $null
        serviceAccount = 'CORP\svc-sql'; serviceState = 'Running'
        agentServiceAccount = 'CORP\svc-sqlagent'; agentServiceState = 'Running'
        connectedStatus = 'ok'; connectedReason = $null
        permissions = Perms 'CORP\svc-census'
        serverProperties = [ordered]@{ productVersion = '15.0.4335.1'; edition = 'Enterprise Edition (64-bit)'; serverCollation = 'SQL_Latin1_General_CP1_CI_AS' }
        databases = $prodDatabases
        databaseFiles = $prodFiles
    },
    # Rights were tightened on this instance: the database list would be silently partial, so
    # the reader must show a permission failure rather than "0 databases".
    [ordered]@{
        instanceName = 'REPORTING'; edition = 'Standard Edition'; version = '15.0.2000.5'
        patchLevel = '15.0.4335.1'; sqlBinRoot = 'C:\Program Files\Microsoft SQL Server\MSSQL15.REPORTING\MSSQL\Binn'
        sqlDataRoot = 'C:\Program Files\Microsoft SQL Server\MSSQL15.REPORTING\MSSQL'
        collation = 'SQL_Latin1_General_CP1_CI_AS'; loginMode = 1
        backupDirectory = 'F:\backups'; tcpPort = $null; tcpDynamicPorts = '49312'
        serviceAccount = 'NT Service\MSSQL$REPORTING'; serviceState = 'Running'
        agentServiceAccount = $null; agentServiceState = 'Stopped'
        connectedStatus = 'insufficient-rights'
        connectedReason = 'VIEW ANY DEFINITION denied for CORP\svc-census; database and file lists would be silently partial'
        permissions = Perms 'CORP\svc-census' $false $false $true
        serverProperties = [ordered]@{ productVersion = '15.0.4335.1'; edition = 'Standard Edition (64-bit)'; serverCollation = 'SQL_Latin1_General_CP1_CI_AS' }
        databases = @()
        databaseFiles = @()
    },
    # Stopped service: skipped outright, never connected to, so it cannot contribute a timeout.
    [ordered]@{
        instanceName = 'ARCHIVE'; edition = 'Standard Edition'; version = '13.0.1601.5'
        patchLevel = '13.0.5426.0'; sqlBinRoot = 'C:\Program Files\Microsoft SQL Server\MSSQL13.ARCHIVE\MSSQL\Binn'
        sqlDataRoot = 'C:\Program Files\Microsoft SQL Server\MSSQL13.ARCHIVE\MSSQL'
        collation = 'SQL_Latin1_General_CP1_CI_AS'; loginMode = 1
        backupDirectory = 'F:\backups'; tcpPort = $null; tcpDynamicPorts = '0'
        serviceAccount = 'NT Service\MSSQL$ARCHIVE'; serviceState = 'Stopped'
        agentServiceAccount = $null; agentServiceState = 'Stopped'
        connectedStatus = 'skipped'; connectedReason = 'service MSSQL$ARCHIVE is Stopped'
        permissions = $null; serverProperties = $null
        databases = @(); databaseFiles = @()
    }
)

# The second snapshot must differ in at least one comparable field per section, or the three
# new diff sections ship unverified: LegacyCRM comes back online, Reporting's owner changes,
# and Portal's log file moves to a different volume.
$sql01InstancesDay2 = $sql01Instances | ForEach-Object {
    $copy = [ordered]@{}
    $_.GetEnumerator() | ForEach-Object { $copy[$_.Key] = $_.Value }
    $copy
}
$day2Databases = $prodDatabases | ForEach-Object {
    $copy = [ordered]@{}
    $_.GetEnumerator() | ForEach-Object { $copy[$_.Key] = $_.Value }
    if ($copy.name -eq 'LegacyCRM') { $copy.stateDesc = 'ONLINE' }
    if ($copy.name -eq 'Reporting') { $copy.owner = 'sa' }
    $copy
}
$day2Files = $prodFiles | ForEach-Object {
    $copy = [ordered]@{}
    $_.GetEnumerator() | ForEach-Object { $copy[$_.Key] = $_.Value }
    if ($copy.logicalName -eq 'Portal_log') {
        $copy.physicalName = 'F:\sqllogs\Portal_log.ldf'
        $copy.directory = 'F:\sqllogs'
    }
    # Every data file grows overnight, as they do in reality. The sqlDatabaseFiles diff must
    # stay silent about it (census-web.md 10.3, decision S-2) - otherwise every database on
    # every server reads as changed every single day.
    if ($copy.typeDesc -eq 'ROWS') {
        $copy.sizePages = [int64]$copy.sizePages + 1024
        $copy.sizeBytes = [int64]$copy.sizePages * 8192
    }
    $copy
}
$sql01InstancesDay2[0].databases = $day2Databases
$sql01InstancesDay2[0].databaseFiles = $day2Files

# Machines with an engine but no connected data keep registry-only discovery.
function RegistryOnly {
    param($Instances)
    $Instances | ForEach-Object {
        $copy = [ordered]@{}
        $_.GetEnumerator() | ForEach-Object { $copy[$_.Key] = $_.Value }
        $copy
    }
}

$targets = @(
    @{ File = 'SQL01\sql01-census-20260731.json'; Instances = $sql01Instances;     Duration = 1180 }
)

foreach ($target in $targets) {
    $path = Join-Path $root $target.File
    if (-not (Test-Path $path)) { Write-Host "skipped (absent): $($target.File)"; continue }
    $envelope = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $envelope.sqlserver = [PSCustomObject]([ordered]@{
        status     = 'ok'
        data       = [ordered]@{ instances = $target.Instances }
        durationMs = $target.Duration
    })
    $envelope | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $path -Encoding utf8
    Write-Host "rewrote $($target.File)"
}

# SQL01 has only one snapshot in the demo tree; the diff sections need two. Clone 20260731
# into a 20260730 sibling carrying the day-1 state, so the changes feed has something real to
# render (census-web.md 10.5).
$day1Path = Join-Path $root 'SQL01\sql01-census-20260730.json'
$day2Path = Join-Path $root 'SQL01\sql01-census-20260731.json'
if (Test-Path $day2Path) {
    $envelope = Get-Content -LiteralPath $day2Path -Raw | ConvertFrom-Json
    $envelope.collectedUtc = '2026-07-30T03:00:41.0000000Z'
    $envelope.sqlserver = [PSCustomObject]([ordered]@{
        status     = 'ok'
        data       = [ordered]@{ instances = $sql01Instances }
        durationMs = 1094
    })
    $envelope | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $day1Path -Encoding utf8
    Write-Host 'wrote    SQL01\sql01-census-20260730.json (day-1 sibling)'

    $envelope2 = Get-Content -LiteralPath $day2Path -Raw | ConvertFrom-Json
    $envelope2.sqlserver = [PSCustomObject]([ordered]@{
        status     = 'ok'
        data       = [ordered]@{ instances = $sql01InstancesDay2 }
        durationMs = 1180
    })
    $envelope2 | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $day2Path -Encoding utf8
    Write-Host 'rewrote  SQL01\sql01-census-20260731.json (day-2 changes)'
}
