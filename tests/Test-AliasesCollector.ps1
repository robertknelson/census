<#
.SYNOPSIS
    Exercises the aliases collector (census-collector.md 8.1.1) on the local machine.
.DESCRIPTION
    Aliases is a derived post-pass: it aggregates from identity, iis, certificates and
    sqlserver. The assertions that matter most are not about which names it finds - that
    varies per box - but about the invariants:

      - it never invents an alias a source did not supply
      - it records which sources contributed, so a smaller set on a degraded run is
        explainable rather than looking like removal
      - it degrades rather than fails when a source collector did

    Run it anywhere; the machine-specific assertions adapt to what is present.
#>
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'Invoke-Census.ps1'), [ref]$null, [ref]$null)
foreach ($function in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
    Invoke-Expression $function.Extent.Text
}

$script:passed = 0
$script:failed = 0
function Assert-That {
    param([string]$Name, [bool]$Condition, $Actual = '')
    if ($Condition) { $script:passed++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else            { $script:failed++; Write-Host "  FAIL  $Name  [actual: $Actual]" -ForegroundColor Red }
}

$identity     = Invoke-CensusCategory { Get-CensusIdentity }
$iis          = Invoke-CensusCategory { Get-CensusIis }
$certificates = Invoke-CensusCategory { Get-CensusCertificates -IisResult $iis }
$sql          = Invoke-CensusCategory { Get-CensusSqlServer }

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$result = Invoke-CensusCategory {
    Get-CensusAliases -IdentityResult $identity -IisResult $iis -CertificatesResult $certificates -SqlServerResult $sql
}
$stopwatch.Stop()

$aliases = @($result.data.aliases)
# Call sites must wrap this in @(). PowerShell unrolls a one-element array to the element
# itself, and .Count on an [ordered]@{} entry returns its KEY count (3), not 1 - a silently
# wrong answer rather than an error.
function Get-Kind {
    param([string]$Kind, $From = $null)
    if ($null -eq $From) { $From = $aliases }
    return @($From | Where-Object { $_.kind -eq $Kind })
}

Write-Host "Collector (elapsed $($stopwatch.ElapsedMilliseconds) ms, $($aliases.Count) aliases)" -ForegroundColor Cyan
Assert-That 'status is ok' ($result.status -eq 'ok') $result.status
Assert-That 'at least the netbios name is emitted' ($aliases.Count -ge 1) $aliases.Count
Assert-That 'completes well inside any sane budget' ($stopwatch.ElapsedMilliseconds -lt 30000) $stopwatch.ElapsedMilliseconds

Write-Host "`nShape" -ForegroundColor Cyan
Assert-That 'every entry has kind, value and source' (@($aliases | Where-Object { [string]::IsNullOrWhiteSpace($_.kind) -or [string]::IsNullOrWhiteSpace($_.value) -or [string]::IsNullOrWhiteSpace($_.source) }).Count -eq 0) ''
Assert-That 'no duplicate (kind, value) pair' ((@($aliases | ForEach-Object { "$($_.kind)|$($_.value)" } | Sort-Object -Unique).Count) -eq $aliases.Count) ''
$netbios = @(Get-Kind 'netbios')
Assert-That 'netbios matches this machine' ($netbios.Count -eq 1 -and $netbios[0].value -eq $env:COMPUTERNAME) ($netbios | ForEach-Object { $_.value })
Assert-That 'exactly one netbios alias' ($netbios.Count -eq 1) $netbios.Count

Write-Host "`nContributing sources (section 6.6)" -ForegroundColor Cyan
$sources = $result.data.sources
foreach ($name in @('identity', 'iis', 'certificates', 'sqlserver', 'network')) {
    Assert-That "source '$name' recorded" (-not [string]::IsNullOrWhiteSpace($sources.$name)) $sources.$name
}
Assert-That 'recorded source statuses match the inputs' (
    $sources.identity -eq $identity.status -and $sources.iis -eq $iis.status -and
    $sources.certificates -eq $certificates.status -and $sources.sqlserver -eq $sql.status) ''

Write-Host "`nProvenance - nothing is invented" -ForegroundColor Cyan
# Every alias must trace to a source that actually succeeded.
$failedSources = @($aliases | Where-Object { $_.source -ne 'network' -and $sources.($_.source) -ne 'ok' })
Assert-That 'no alias claims a source that did not succeed' ($failedSources.Count -eq 0) (@($failedSources | ForEach-Object { "$($_.kind)/$($_.source)" }) -join ',')

if ($identity.status -eq 'ok' -and $identity.data.machineGuid) {
    $guid = @(Get-Kind 'machineGuid')
    Assert-That 'machineGuid carried through from identity' ($guid.Count -eq 1 -and $guid[0].value -eq $identity.data.machineGuid) ''
}
$sqlInstanceAliases = @(Get-Kind 'sqlInstance')
if ($sql.status -eq 'ok') {
    $instanceCount = @($sql.data.instances | Where-Object { $_.instanceName }).Count
    Assert-That "one sqlInstance alias per discovered instance ($instanceCount)" ($sqlInstanceAliases.Count -eq $instanceCount) $sqlInstanceAliases.Count
}
else {
    Assert-That 'no sqlInstance alias when SQL is absent' ($sqlInstanceAliases.Count -eq 0) $sqlInstanceAliases.Count
}
if ($iis.status -ne 'ok') {
    $bindingAliases = @(Get-Kind 'bindingHostHeader')
    Assert-That 'no bindingHostHeader alias when IIS is absent' ($bindingAliases.Count -eq 0) $bindingAliases.Count
}
Assert-That 'loopback never emitted as an address' (@($aliases | Where-Object { $_.value -eq '127.0.0.1' }).Count -eq 0) ''

Write-Host "`nDegradation - a smaller set must not read as removal" -ForegroundColor Cyan
$degraded = Invoke-CensusCategory {
    Get-CensusAliases -IdentityResult $identity `
        -IisResult @{ status = 'failed'; reason = 'simulated' } `
        -CertificatesResult @{ status = 'failed'; reason = 'simulated' } `
        -SqlServerResult @{ status = 'not-present'; reason = 'simulated' }
}
$degradedAliases = @($degraded.data.aliases)
Assert-That 'degraded run still succeeds' ($degraded.status -eq 'ok') $degraded.status
Assert-That 'degraded run yields no more aliases than the full one' ($degradedAliases.Count -le $aliases.Count) "$($degradedAliases.Count) vs $($aliases.Count)"
Assert-That 'degraded run still emits the netbios name' (@($degradedAliases | Where-Object { $_.kind -eq 'netbios' }).Count -eq 1) ''
Assert-That 'degraded run records the failed sources' ($degraded.data.sources.iis -eq 'failed' -and $degraded.data.sources.certificates -eq 'failed') "$($degraded.data.sources.iis)/$($degraded.data.sources.certificates)"
Assert-That 'degraded run drops the sqlInstance aliases' (@($degradedAliases | Where-Object { $_.kind -eq 'sqlInstance' }).Count -eq 0) ''

Write-Host "`nSerialisation" -ForegroundColor Cyan
$json = $result | ConvertTo-Json -Depth 10
Assert-That 'survives ConvertTo-Json without truncation' (-not $json.Contains('System.Object[]') -and -not $json.Contains('System.Collections.Hashtable')) ''

Write-Host "`n$('-' * 60)"
Write-Host "passed: $script:passed   failed: $script:failed" -ForegroundColor $(if ($script:failed) { 'Red' } else { 'Green' })
if ($script:failed) { exit 1 }
