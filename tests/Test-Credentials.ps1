<#
.SYNOPSIS
    Exercises credential-bucket resolution and the run outcome vocabulary
    (census-collector.md 5.2.1 / 5.2.2).
.DESCRIPTION
    HONEST SCOPE. This environment has one machine and one account, so the thing the feature
    exists for - reaching a different machine as a different identity - cannot be exercised
    here at all. What IS verifiable, and is verified below:

      - bucket resolution, including the config-error paths
      - task-identity resolving to NO credential rather than an empty one
      - a real DPAPI round-trip via Export-CliXml / Import-CliXml
      - the credential-error path when the file is absent or undecryptable
      - the outcome classifier that keeps 'access-denied' distinct from 'unreachable'
      - the context block, and that no credential material reaches it

    NOT verified anywhere: an actual remote WinRM call carrying a -Credential. That ships
    structurally correct and unexercised, like the double-hop assumption.
#>
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $repo 'Invoke-Census.ps1'

$script:passed = 0
$script:failed = 0
function Assert-That {
    param([string]$Name, [bool]$Condition, $Actual = '')
    if ($Condition) { $script:passed++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else            { $script:failed++; Write-Host "  FAIL  $Name  [actual: $Actual]" -ForegroundColor Red }
}

# --- lift the orchestrator's functions without running the orchestration -------------------
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$null, [ref]$null)
foreach ($function in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
    Invoke-Expression $function.Extent.Text
}
# The collector is a top-level variable assignment rather than a function, so the sweep above
# does not pick it up.
$collectAssignment = $ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and
    $node.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and
    $node.Left.VariablePath.UserPath -eq 'CollectScriptBlock'
}, $true) | Select-Object -First 1
Invoke-Expression $collectAssignment.Extent.Text

$work = Join-Path ([System.IO.Path]::GetTempPath()) 'census-cred-test'
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $work 'config\creds') -Force | Out-Null

# A real DPAPI round-trip. The password never leaves this process as plaintext on disk.
$goodCredPath = Join-Path $work 'config\creds\good.cred.xml'
$secret = ConvertTo-SecureString 'not-a-real-password' -AsPlainText -Force
(New-Object System.Management.Automation.PSCredential('CORP\svc-census', $secret)) | Export-CliXml -Path $goodCredPath

# A file that exists but is not a credential - stands in for "DPAPI refuses to decrypt".
$badCredPath = Join-Path $work 'config\creds\corrupt.cred.xml'
Set-Content -Path $badCredPath -Value 'not a clixml document' -Encoding utf8

$MachinesPath   = Join-Path $work 'machines.json'
$scriptRoot     = $work
$machinesConfig = [PSCustomObject]@{
    version  = 1
    buckets  = @(
        [PSCustomObject]@{ id = 'corp';    credential = [PSCustomObject]@{ kind = 'task-identity' } },
        [PSCustomObject]@{ id = 'dmz';     credential = [PSCustomObject]@{ kind = 'clixml'; path = 'config\creds\good.cred.xml' }; trustedHosts = @('OLDVM01') },
        [PSCustomObject]@{ id = 'missing'; credential = [PSCustomObject]@{ kind = 'clixml'; path = 'config\creds\absent.cred.xml' } },
        [PSCustomObject]@{ id = 'corrupt'; credential = [PSCustomObject]@{ kind = 'clixml'; path = 'config\creds\corrupt.cred.xml' } },
        [PSCustomObject]@{ id = 'weird';   credential = [PSCustomObject]@{ kind = 'smartcard' } }
    )
    machines = @()
}
$bucketsById = @{}
foreach ($bucket in @($machinesConfig.buckets)) { $bucketsById[$bucket.id] = $bucket }
$credentialCache = @{}

Write-Host 'Bucket resolution' -ForegroundColor Cyan
$corp = Resolve-CensusCredential -BucketId 'corp'
Assert-That 'task-identity resolves ok' ($corp.status -eq 'ok') $corp.status
Assert-That 'task-identity yields NO credential, not an empty one' ($null -eq $corp.credential) $corp.credential

$dmz = Resolve-CensusCredential -BucketId 'dmz'
Assert-That 'clixml credential loads' ($dmz.status -eq 'ok') "$($dmz.status): $($dmz.reason)"
Assert-That 'loaded credential is a PSCredential' ($dmz.credential -is [System.Management.Automation.PSCredential]) $dmz.credential.GetType().Name
Assert-That 'loaded credential carries the expected user' ($dmz.credential.UserName -eq 'CORP\svc-census') $dmz.credential.UserName

$absent = Resolve-CensusCredential -BucketId 'missing'
Assert-That 'absent credential file is credential-error' ($absent.status -eq 'credential-error') $absent.status
Assert-That 'absent file names the path' ($absent.reason -like '*absent.cred.xml*') $absent.reason

$corrupt = Resolve-CensusCredential -BucketId 'corrupt'
Assert-That 'undecryptable file is credential-error' ($corrupt.status -eq 'credential-error') $corrupt.status
# The DPAPI trap is the most likely day-one failure, so the message has to teach.
Assert-That 'undecryptable file explains the DPAPI user/machine binding' ($corrupt.reason -like '*user- and machine-bound*') $corrupt.reason
Assert-That 'undecryptable file names the running account' ($corrupt.reason -like "*$([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)*") $corrupt.reason

$unknownBucket = Resolve-CensusCredential -BucketId 'nope'
Assert-That 'undefined bucket is config-error' ($unknownBucket.status -eq 'config-error') $unknownBucket.status
$noBucket = Resolve-CensusCredential -BucketId ''
Assert-That 'no bucket is a config error, not a default' ($noBucket.status -eq 'config-error') $noBucket.status
Assert-That 'no-bucket message says there is no default' ($noBucket.reason -like '*no default*') $noBucket.reason
$weird = Resolve-CensusCredential -BucketId 'weird'
Assert-That 'unknown credential kind is config-error' ($weird.status -eq 'config-error') $weird.status

Write-Host "`nCaching - a DPAPI file is read once per bucket, not once per machine" -ForegroundColor Cyan
Assert-That 'resolution is cached' ($credentialCache.ContainsKey('dmz')) ''
Remove-Item $goodCredPath -Force
$dmzAgain = Resolve-CensusCredential -BucketId 'dmz'
Assert-That 'cached credential survives the file going away mid-run' ($dmzAgain.status -eq 'ok' -and $dmzAgain.credential.UserName -eq 'CORP\svc-census') $dmzAgain.status

Write-Host "`nOutcome vocabulary - access-denied must never read as unreachable" -ForegroundColor Cyan
$denied = @(
    'Access is denied.',
    'WinRM cannot process the request: the user name or password is incorrect.',
    'Connecting to remote server failed with the following error message : Access is denied. For more information, see the about_Remote_Troubleshooting Help topic.'
)
foreach ($message in $denied) {
    Assert-That "classified access-denied: '$($message.Substring(0, [Math]::Min(42, $message.Length)))...'" ((Get-CensusFailureOutcome $message) -eq 'access-denied') (Get-CensusFailureOutcome $message)
}
$unreachable = @(
    'The WinRM client cannot process the request because the server name cannot be resolved.',
    'The client cannot connect to the destination specified in the request.'
)
foreach ($message in $unreachable) {
    Assert-That "classified unreachable: '$($message.Substring(0, [Math]::Min(42, $message.Length)))...'" ((Get-CensusFailureOutcome $message) -eq 'unreachable') (Get-CensusFailureOutcome $message)
}

Write-Host "`nTrustedHosts - reported, never written" -ForegroundColor Cyan
$before = $null
try { $before = (Get-Item WSMan:\localhost\Client\TrustedHosts -ErrorAction Stop).Value } catch { }
$report = Get-CensusTrustedHostsReport
Assert-That 'declared host is reported on' ($report.ContainsKey('OLDVM01')) ($report.Keys -join ',')
Assert-That 'verdict is one of present/missing/unknown' (@('present', 'missing', 'unknown') -contains $report['OLDVM01']) $report['OLDVM01']
$after = $null
try { $after = (Get-Item WSMan:\localhost\Client\TrustedHosts -ErrorAction Stop).Value } catch { }
Assert-That 'TrustedHosts was NOT modified by reporting on it' ($before -eq $after) "'$before' -> '$after'"

Write-Host "`nContext block" -ForegroundColor Cyan
$censusJson = & $CollectScriptBlock
$census = $censusJson | ConvertFrom-Json
$context = $census.context
Assert-That 'context is emitted' ($null -ne $context) ''
Assert-That 'psVersion recorded' (-not [string]::IsNullOrWhiteSpace($context.psVersion)) $context.psVersion
Assert-That 'runAs recorded' ($context.runAs -eq [System.Security.Principal.WindowsIdentity]::GetCurrent().Name) $context.runAs
Assert-That 'elevated recorded as a boolean' ($context.elevated -is [bool]) $context.elevated
Assert-That 'is64Bit recorded as a boolean' ($context.is64Bit -is [bool]) $context.is64Bit
# transport and bucket are control-box knowledge; the collector must not invent them.
Assert-That 'collector does NOT set transport' ($null -eq $context.transport) $context.transport
Assert-That 'collector does NOT set bucket' ($null -eq $context.bucket) $context.bucket
Assert-That 'no credential material anywhere in the context block' (-not (($context | ConvertTo-Json) -match 'password|secret|credential')) ''

Write-Host "`nConfig files parse to the ratified shape" -ForegroundColor Cyan
foreach ($name in @('machines.json', 'machines.demo.json')) {
    $config = Get-Content (Join-Path $repo "config\$name") -Raw | ConvertFrom-Json
    Assert-That "$name declares buckets" (@($config.buckets).Count -ge 1) @($config.buckets).Count
    Assert-That "$name machines are objects, not bare strings" (@($config.machines)[0].name -is [string]) ''
    $ids = @($config.buckets | ForEach-Object { $_.id })
    $orphans = @($config.machines | Where-Object { $ids -notcontains $_.bucket })
    Assert-That "$name has no machine naming an undefined bucket" ($orphans.Count -eq 0) (@($orphans | ForEach-Object { "$($_.name)->$($_.bucket)" }) -join ',')
}

Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "`n$('-' * 60)"
Write-Host 'NOT verified here: a remote WinRM call carrying a -Credential. One machine, one' -ForegroundColor Yellow
Write-Host 'account - that path ships structurally correct and unexercised.' -ForegroundColor Yellow
Write-Host "passed: $script:passed   failed: $script:failed" -ForegroundColor $(if ($script:failed) { 'Red' } else { 'Green' })
if ($script:failed) { exit 1 }
