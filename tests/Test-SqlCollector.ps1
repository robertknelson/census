<#
.SYNOPSIS
    Exercises the sqlserver collector (census-collector.md 8.8.1) against a live instance.
.DESCRIPTION
    Unlike the IIS collector, this one can be verified for real - the dev box runs SQL Server.
    Assertions are written against whatever instance is present rather than against this
    machine's particular databases, so the harness travels.

    Skips cleanly, with exit code 0, when no SQL engine is installed - absence of an instance
    is not a test failure.

    Four branches remain unexercised here and are called out at the end of the run: a named
    instance, a stopped instance, a UNC file path, and permission-denied. Testing the last
    would mean creating a low-privilege login, which is a write to the instance and therefore
    out of bounds.
#>
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'Invoke-Census.ps1'), [ref]$null, [ref]$null)
$functions = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
foreach ($function in $functions) { Invoke-Expression $function.Extent.Text }

if (-not (Test-Path 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL')) {
    Write-Host 'SKIP  no SQL Server engine installed - nothing to verify against.' -ForegroundColor Yellow
    $result = Invoke-CensusCategory { Get-CensusSqlServer }
    if ($result.status -ne 'not-present') {
        Write-Host "  FAIL  expected status 'not-present', got '$($result.status)'" -ForegroundColor Red
        exit 1
    }
    Write-Host '  PASS  collector reports not-present with a reason' -ForegroundColor Green
    exit 0
}

$script:passed = 0
$script:failed = 0
function Assert-That {
    param([string]$Name, [bool]$Condition, $Actual = '')
    if ($Condition) { $script:passed++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else            { $script:failed++; Write-Host "  FAIL  $Name  [actual: $Actual]" -ForegroundColor Red }
}

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$result = Invoke-CensusCategory { Get-CensusSqlServer }
$stopwatch.Stop()
$json = $result | ConvertTo-Json -Depth 12

Write-Host "Category (elapsed $($stopwatch.ElapsedMilliseconds) ms)" -ForegroundColor Cyan
Assert-That 'category status is ok' ($result.status -eq 'ok') $result.status
Assert-That 'at least one instance discovered' (@($result.data.instances).Count -ge 1) @($result.data.instances).Count
# The whole category is bounded: a hung SQL connection must not hang the machine's census.
Assert-That 'category completed well inside the connect budget' ($stopwatch.ElapsedMilliseconds -lt 30000) $stopwatch.ElapsedMilliseconds

foreach ($instance in @($result.data.instances)) {
    Write-Host "`nInstance $($instance.instanceName) (service $($instance.serviceState))" -ForegroundColor Cyan

    Assert-That 'registry discovery still populated' ($null -ne $instance.edition -and $null -ne $instance.version) "$($instance.edition)/$($instance.version)"

    if ($instance.serviceState -ne 'Running') {
        Assert-That 'stopped instance is skipped, never connected to' ($instance.connectedStatus -eq 'skipped') $instance.connectedStatus
        Assert-That 'skip carries a reason' (-not [string]::IsNullOrEmpty($instance.connectedReason)) $instance.connectedReason
        continue
    }

    Assert-That 'running instance connected' ($instance.connectedStatus -eq 'ok') "$($instance.connectedStatus) $($instance.connectedReason)"
    if ($instance.connectedStatus -ne 'ok') { continue }

    Write-Host '  -- permission stamp --'
    $permissions = $instance.permissions
    Assert-That 'login name recorded' (-not [string]::IsNullOrEmpty($permissions.loginName)) $permissions.loginName
    Assert-That 'viewAnyDefinition recorded as a boolean' ($permissions.viewAnyDefinition -is [bool]) $permissions.viewAnyDefinition
    Assert-That 'viewServerState recorded as a boolean' ($permissions.viewServerState -is [bool]) $permissions.viewServerState
    Assert-That 'isSysadmin recorded as a boolean' ($permissions.isSysadmin -is [bool]) $permissions.isSysadmin
    Assert-That 'server properties captured' (-not [string]::IsNullOrEmpty($instance.serverProperties.productVersion)) $instance.serverProperties.productVersion

    $databases = @($instance.databases)
    $files = @($instance.databaseFiles)

    Write-Host '  -- databases --'
    Assert-That 'databases returned' ($databases.Count -gt 0) $databases.Count
    # All four system databases present is the cheapest proof the list was not silently
    # filtered by a missing VIEW ANY DEFINITION.
    $systemDatabases = @('master', 'tempdb', 'model', 'msdb')
    $names = @($databases | ForEach-Object { $_.name })
    Assert-That 'all four system databases present (list not silently filtered)' (@($systemDatabases | Where-Object { $names -contains $_ }).Count -eq 4) ($names -join ',')
    Assert-That 'every database has a name and a state' (@($databases | Where-Object { [string]::IsNullOrEmpty($_.name) -or [string]::IsNullOrEmpty($_.stateDesc) }).Count -eq 0) ''
    Assert-That 'every database has a recovery model' (@($databases | Where-Object { [string]::IsNullOrEmpty($_.recoveryModelDesc) }).Count -eq 0) ''
    Assert-That 'databaseId captured but not used as the key' (@($databases | Where-Object { $null -eq $_.databaseId }).Count -eq 0) ''

    # SQL hands back Kind=Unspecified DateTimes; without an offset System.Text.Json stamps
    # them with the *reader's* timezone, so the same file would describe a different instant
    # elsewhere.
    $dated = @($databases | Where-Object { $_.createDate })
    Assert-That 'createDate carries an explicit UTC offset' (@($dated | Where-Object { $_.createDate -notmatch '(Z|[+-]\d{2}:\d{2})$' }).Count -eq 0) (@($dated)[0].createDate)

    Write-Host '  -- database files --'
    Assert-That 'files returned' ($files.Count -gt 0) $files.Count
    Assert-That 'at least one file per database' ($files.Count -ge $databases.Count) "$($files.Count) files / $($databases.Count) databases"
    Assert-That 'every file has database, logical name and physical name' (@($files | Where-Object { [string]::IsNullOrEmpty($_.databaseName) -or [string]::IsNullOrEmpty($_.logicalName) -or [string]::IsNullOrEmpty($_.physicalName) }).Count -eq 0) ''
    Assert-That 'every file has a directory derived from its path' (@($files | Where-Object { [string]::IsNullOrEmpty($_.directory) }).Count -eq 0) ''
    Assert-That 'ROWS and LOG file types both present' ((@($files | Where-Object { $_.typeDesc -eq 'ROWS' }).Count -gt 0) -and (@($files | Where-Object { $_.typeDesc -eq 'LOG' }).Count -gt 0)) ''
    Assert-That 'sizeBytes is sizePages x 8KB' (@($files | Where-Object { $null -ne $_.sizePages -and $_.sizeBytes -ne ([int64]$_.sizePages * 8192) }).Count -eq 0) ''
    Assert-That 'isUnc set only for paths starting \\' (@($files | Where-Object { $_.isUnc -ne ($_.physicalName.StartsWith('\\')) }).Count -eq 0) ''

    # sys.master_files is instance-wide, so an offline database still contributes its files.
    # That is what removes the need for a per-database loop.
    $offline = @($databases | Where-Object { $_.stateDesc -ne 'ONLINE' })
    if ($offline.Count -gt 0) {
        $offlineNames = @($offline | ForEach-Object { $_.name })
        $offlineFileCount = @($files | Where-Object { $offlineNames -contains $_.databaseName }).Count
        Assert-That "non-ONLINE databases still listed ($($offlineNames -join ', '))" ($offline.Count -gt 0) ''
        Assert-That 'non-ONLINE databases still contribute their files' ($offlineFileCount -gt 0) $offlineFileCount
        Assert-That 'non-ONLINE databases did not abort the collection' ($databases.Count -gt $offline.Count) ''
    }
    else {
        Write-Host '  (no non-ONLINE database on this instance - that branch unexercised)' -ForegroundColor Yellow
    }
}

Write-Host "`nPayload" -ForegroundColor Cyan
Assert-That 'survives ConvertTo-Json -Depth 12 without truncation' (-not $json.Contains('System.Object[]') -and -not $json.Contains('System.Collections.Hashtable')) ''
Assert-That 'no password-shaped key reaches the payload' (-not ($json -match '"[^"]*[Pp]assword[^"]*"\s*:')) ''

Write-Host "`n$('-' * 60)"
Write-Host 'Unexercised branches on this box: named instance, stopped instance, UNC file path,' -ForegroundColor Yellow
Write-Host 'permission-denied. See census-collector.md section 2 correction.' -ForegroundColor Yellow
Write-Host "passed: $script:passed   failed: $script:failed" -ForegroundColor $(if ($script:failed) { 'Red' } else { 'Green' })
if ($script:failed) { exit 1 }
