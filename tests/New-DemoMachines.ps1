<#
    Creates the base envelopes for the demo machines that were added after the original
    fixture set: WEB02, SQL02, and BUILDSRV01's second snapshot.

    WHY THIS EXISTS. New-DemoIisData.ps1 and New-DemoSqlData.ps1 *patch* the `iis` and
    `sqlserver` categories of files that already exist - neither can create a machine. Every
    other category (identity, memory, os, updates, dotnet, drives, apps, certificates) was
    hand-authored into committed JSON when the fixture set was first built, so there was no
    mechanism for adding a machine at all.

    RUN ORDER. This first, then New-DemoIisData.ps1, then New-DemoSqlData.ps1 - the two
    category generators overwrite the placeholders written here.

    Deterministic: re-running produces byte-identical files. The demo tree is fabricated and
    permanently so (census-web.md 9.6).

    WHAT THE NEW MACHINES ARE FOR. Mostly estate-level work: a second dedicated web server and
    a second dedicated database server, so owner rollups, class filtering, compare, and canvas
    density have more than one of each to work with. APPSRV01 is both a web and a database box,
    which made "two web servers side by side" really one web server and one hybrid.

    They still earn their place at the payload level, covering branches the original three
    do not (see census-web.md 9.6 / 10.5):
      WEB02  - an out-of-process ASP.NET Core app, a self-contained processPath (a bare .exe
               rather than `dotnet`), a dependency edge whose provider is not understood
               (parseStatus 'unrecognized'), and an ALREADY EXPIRED certificate - WEB01 only
               has one expiring in 15 days, and expired is a different render.
      SQL02  - the DEFAULT instance (MSSQLSERVER). Every instance on SQL01 is named, so the
               default-instance path has never been rendered. Plus an older major version, and
               a connection that timed out rather than being refused or skipped.
#>
$ErrorActionPreference = 'Stop'
$root = Join-Path (Split-Path -Parent $PSScriptRoot) 'output-demo'

function Category {
    param($Data, [int]$DurationMs, [string]$Status = 'ok')
    [ordered]@{ status = $Status; data = $Data; durationMs = $DurationMs }
}

function Absent {
    param([string]$Reason, [int]$DurationMs)
    [ordered]@{ status = 'not-present'; reason = $Reason; durationMs = $DurationMs }
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
    param([string]$Subject, [string[]]$San, [string]$Thumbprint, [string]$NotBefore,
          [string]$NotAfter, [int]$DaysUntilExpiry, [string[]]$BoundTo = @())
    [ordered]@{
        subject         = $Subject
        sanDnsNames     = $San
        issuer          = 'CN=Corp Issuing CA 1, DC=corp, DC=example, DC=com'
        thumbprint      = $Thumbprint
        notBefore       = $NotBefore
        notAfter        = $NotAfter
        keySize         = 2048
        daysUntilExpiry = $DaysUntilExpiry
        boundTo         = $BoundTo
    }
}

$iisAbsent = 'HKLM:\SOFTWARE\Microsoft\InetStp absent'
$sqlAbsent = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL absent'

# --- WEB02 --------------------------------------------------------------------------------
# Physical rack server rather than a VM: every other demo box is virtual, so the chassis and
# hypervisor-signal branches of the dossier never render the negative case.
function Web02Envelope {
    param([string]$CollectedUtc, [int]$Ubr, [long]$CFree, [bool]$PendingReboot,
          [string[]]$RebootReasons)
    [ordered]@{
        schemaVersion    = 1
        collectorVersion = '1.0.0'
        computerName     = 'WEB02'
        collectedUtc     = $CollectedUtc
        identity         = Category ([ordered]@{
            domain               = 'corp.example.com'
            manufacturer         = 'Dell Inc.'
            model                = 'PowerEdge R650'
            smbiosUuid           = '4c4c4544-0052-3610-8052-b7c04f565331'
            machineGuid          = 'b2c3d4e5-6f70-4812-9a3b-4c5d6e7f8a06'
            biosSerialNumber     = 'JR6Q2S3'
            isVirtual            = $false
            hypervisorSignals    = @()
            cpuSockets           = 2
            cpuCores             = 16
            cpuLogicalProcessors = 32
        }) 288
        memory  = Category ([ordered]@{ totalPhysicalMemoryBytes = 137438953472; totalPhysicalMemoryGB = 128 }) 9
        os      = Category ([ordered]@{
            productName          = 'Windows Server 2022 Standard'
            editionId            = 'ServerStandard'
            installationType     = 'Server'
            currentBuild         = '20348'
            ubr                  = $Ubr
            displayVersion       = '21H2'
            architecture         = '64-bit'
            installDate          = '2023-06-14T11:20:00.0000000-04:00'
            lastBootUpTime       = '2026-07-19T02:15:00.0000000-04:00'
            pendingReboot        = $PendingReboot
            pendingRebootReasons = $RebootReasons
        }) 91
        updates = Category ([ordered]@{
            currentBuild           = '20348'
            ubr                    = $Ubr
            lastDetectSuccessTime  = '2026-07-30 01:55:00'
            lastInstallSuccessTime = '2026-07-14 03:05:00'
        }) 41
        dotnet  = Category ([ordered]@{
            frameworkReleaseId = 533320
            coreRuntimes       = @(
                'Microsoft.AspNetCore.App 8.0.27 [C:\Program Files\dotnet\shared\Microsoft.AspNetCore.App]',
                'Microsoft.NETCore.App 8.0.27 [C:\Program Files\dotnet\shared\Microsoft.NETCore.App]'
            )
            sdks               = @()
        }) 44
        drives  = Category ([ordered]@{ drives = @(
            (Drive 'C' 'OS'   214748364800 $CFree),
            (Drive 'W' 'Web'  1099511627776 659706976665)
        ) }) 232
        # insufficient-rights, NOT failed: BUILDSRV01 already covers `failed` on this category,
        # and the two must render differently - one is "it broke", the other is "truth unknown"
        # (census-collector.md 6.2).
        apps         = [ordered]@{
            status     = 'insufficient-rights'
            reason     = 'Enumerating HKEY_USERS requires elevation; the census account is not an administrator on this machine'
            durationMs = 640
        }
        iis          = Absent $iisAbsent 5
        certificates = Category ([ordered]@{
            certificates = @(
                # Already expired. WEB01 has one expiring in 15 days; expired is a different
                # render and a harder finding, and nothing in the fixture set had one.
                (Cert 'CN=legacy.example.com' @('legacy.example.com') 'A1B2C3D4E5F60718293A4B5C6D7E8F9012345678' `
                    '2024-05-02T00:00:00.0000000-04:00' '2026-05-02T00:00:00.0000000-04:00' -97 @('legacy.example.com:443')),
                (Cert 'CN=WEB02.corp.example.com' @('WEB02.corp.example.com', 'web02') 'B2C3D4E5F60718293A4B5C6D7E8F90123456789A' `
                    '2025-09-18T00:00:00.0000000-04:00' '2027-09-18T00:00:00.0000000-04:00' 407)
            )
            rdpQueryError     = $null
            httpSysQueryError = $null
        }) 61
        sqlserver     = Absent $sqlAbsent 4
        requestedName = 'web02'
        roles         = @('WebServer')
    }
}

# --- SQL02 --------------------------------------------------------------------------------
function Sql02Envelope {
    param([string]$CollectedUtc, [int]$Ubr, [long]$DFree, [string]$LastInstall)
    [ordered]@{
        schemaVersion    = 1
        collectorVersion = '1.0.0'
        computerName     = 'SQL02'
        collectedUtc     = $CollectedUtc
        identity         = Category ([ordered]@{
            domain               = 'corp.example.com'
            manufacturer         = 'Microsoft Corporation'
            model                = 'Virtual Machine'
            smbiosUuid           = '7e1c2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e07'
            machineGuid          = 'c3d4e5f6-7081-4923-ab4c-5d6e7f8a9b07'
            biosSerialNumber     = '9821-4471-0033-2210-5566-7788-91'
            isVirtual            = $true
            hypervisorSignals    = @('Hyper-V')
            cpuSockets           = 1
            cpuCores             = 12
            cpuLogicalProcessors = 24
        }) 301
        memory  = Category ([ordered]@{ totalPhysicalMemoryBytes = 68719476736; totalPhysicalMemoryGB = 64 }) 11
        os      = Category ([ordered]@{
            productName          = 'Windows Server 2016 Standard'
            editionId            = 'ServerStandard'
            installationType     = 'Server'
            currentBuild         = '14393'
            ubr                  = $Ubr
            displayVersion       = '1607'
            architecture         = '64-bit'
            installDate          = '2019-02-08T09:45:00.0000000-05:00'
            lastBootUpTime       = '2026-05-30T04:20:00.0000000-04:00'
            pendingReboot        = $true
            pendingRebootReasons = @('Component Based Servicing', 'Windows Update')
        }) 96
        updates = Category ([ordered]@{
            currentBuild           = '14393'
            ubr                    = $Ubr
            lastDetectSuccessTime  = '2026-07-29 03:40:00'
            lastInstallSuccessTime = $LastInstall
        }) 52
        dotnet  = Category ([ordered]@{
            frameworkReleaseId = 461814
            coreRuntimes       = @()
            sdks               = @()
        }) 38
        drives  = Category ([ordered]@{ drives = @(
            (Drive 'C' 'OS'      107374182400 21474836480),
            (Drive 'D' 'SQLData' 2199023255552 $DFree),
            (Drive 'L' 'SQLLogs' 549755813888 439804651110)
        ) }) 256
        apps         = Category ([ordered]@{ count = 0; entries = @() }) 810
        iis          = Absent $iisAbsent 5
        certificates = Category ([ordered]@{
            certificates      = @()
            rdpQueryError     = 'Access denied reading the RDP certificate binding'
            httpSysQueryError = $null
        }) 44
        sqlserver     = Absent $sqlAbsent 4
        requestedName = 'sql02'
        roles         = @('DatabaseServer')
    }
}

# --- targets ------------------------------------------------------------------------------
# Two snapshots each, differing in comparable fields, so the changes feed and history view
# have something to render for these machines rather than only for WEB01 and SQL01
# (census-web.md 9.6).
$targets = @(
    @{ File = 'WEB02\web02-census-20260730.json'
       Envelope = Web02Envelope '2026-07-30T03:04:22.0000000Z' 2762 96636764160 $false @() }
    @{ File = 'WEB02\web02-census-20260731.json'
       # Patched overnight, and now waiting on the reboot that the patch requires.
       Envelope = Web02Envelope '2026-07-31T03:04:51.0000000Z' 2894 91268055040 $true @('Component Based Servicing') }
    @{ File = 'SQL02\sql02-census-20260730.json'
       Envelope = Sql02Envelope '2026-07-30T02:41:09.0000000Z' 7159 879609302220 '2026-06-09 02:30:00' }
    @{ File = 'SQL02\sql02-census-20260731.json'
       # Data volume fell below 30% free between the two days.
       Envelope = Sql02Envelope '2026-07-31T02:41:33.0000000Z' 7159 615164846080 '2026-06-09 02:30:00' }
)

# --- BUILDSRV01 day 2 ---------------------------------------------------------------------
# Cloned from the committed day-1 file rather than re-authored, so the only differences are
# the ones named here: the build volume filled up and the box is now pending a reboot.
$buildDay1Path = Join-Path $root 'BUILDSRV01\buildsrv01-census-20260731.json'
$buildDay2 = Get-Content -LiteralPath $buildDay1Path -Raw | ConvertFrom-Json
$buildDay2.collectedUtc = '2026-08-01T03:11:52.0000000Z'
$buildDay2.os.data.pendingReboot = $true
$buildDay2.os.data.pendingRebootReasons = @('PendingFileRenameOperations')
$buildDay2.drives.data.drives[1].freeBytes = 21474836480
$buildDay2.drives.data.drives[1].usedBytes = 515396075520
$buildDay2.drives.data.drives[1].percentFree = 4
$buildDay2 | Add-Member -NotePropertyName collectorVersion -NotePropertyValue '1.0.0' -Force

# --- write --------------------------------------------------------------------------------
foreach ($target in $targets) {
    $path = Join-Path $root $target.File
    $dir = Split-Path -Parent $path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $target.Envelope | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $path -Encoding utf8
    Write-Host "wrote $($target.File)"
}

$buildDay2Path = Join-Path $root 'BUILDSRV01\buildsrv01-census-20260801.json'
$buildDay2 | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $buildDay2Path -Encoding utf8
Write-Host 'wrote BUILDSRV01\buildsrv01-census-20260801.json'
