<#
.SYNOPSIS
    Creates the DPAPI-protected credential file for a census bucket, and refuses to create one
    that the census will not be able to read.
.DESCRIPTION
    This is a guard rail over two commands you could run by hand:

        Get-Credential | Export-CliXml -Path <bucket's path>

    The reason it exists is that nothing about running those by hand tells you whether the
    result will work. Export-CliXml encrypts with DPAPI, which binds the blob to the user
    account AND the machine that wrote it. A file created by the wrong account looks perfect,
    reports no error, and fails later - unattended, across every machine in the bucket at once.
    There is no way to inspect a .cred.xml and see who can open it.

    So this script:
      - resolves the output path from the bucket in machines.json, so it cannot land somewhere
        the config is not looking
      - states which account is creating the file
      - compares that against the account the census scheduled task runs as, where one is
        registered, and refuses on a mismatch
      - reads the file back to prove the round-trip before you walk away

    It never prints, logs or stores the password itself.
.PARAMETER BucketId
    The bucket in machines.json to create the credential for. Must be of kind 'clixml'.
.PARAMETER MachinesPath
    Path to the machine list. Defaults to config\machines.json next to this script.
.PARAMETER Force
    Overwrite an existing credential file.
.EXAMPLE
    .\New-CensusCredential.ps1 -BucketId dmz

    Run this AS THE ACCOUNT THE CENSUS RUNS AS. If that is a service account, reach a shell as
    it first:  runas /user:CORP\svc-census powershell.exe
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$BucketId,
    [string]$MachinesPath,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$scriptRoot = $PSScriptRoot
if (-not $scriptRoot) {
    if ($PSCommandPath) { $scriptRoot = Split-Path -Parent $PSCommandPath }
    else                { $scriptRoot = (Get-Location).Path }
}
if (-not $MachinesPath) { $MachinesPath = Join-Path $scriptRoot 'config\machines.json' }

# --- resolve the bucket ------------------------------------------------------------------
if (-not (Test-Path $MachinesPath)) { throw "Machine list not found: $MachinesPath" }
$machinesConfig = Get-Content $MachinesPath -Raw | ConvertFrom-Json

$bucket = @($machinesConfig.buckets) | Where-Object { $_.id -eq $BucketId } | Select-Object -First 1
if (-not $bucket) {
    $known = (@($machinesConfig.buckets) | ForEach-Object { $_.id }) -join ', '
    throw "Bucket '$BucketId' is not defined in $MachinesPath. Known buckets: $known"
}
if ($bucket.credential.kind -ne 'clixml') {
    throw "Bucket '$BucketId' is of kind '$($bucket.credential.kind)', which stores no secret. Only 'clixml' buckets have a credential file. ('task-identity' means the census runs as whoever invokes it.)"
}

$credentialPath = $bucket.credential.path
if (-not [System.IO.Path]::IsPathRooted($credentialPath)) { $credentialPath = Join-Path $scriptRoot $credentialPath }

if ((Test-Path $credentialPath) -and -not $Force) {
    throw "Credential file already exists: $credentialPath. Re-run with -Force to replace it."
}

$machinesInBucket = @($machinesConfig.machines | Where-Object { $_.bucket -eq $BucketId } | ForEach-Object { $_.name })

# --- the check this script exists for ----------------------------------------------------
$creatingAs = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

Write-Host ''
Write-Host "Bucket        : $BucketId" -ForegroundColor Cyan
if ($bucket.description) { Write-Host "                $($bucket.description)" }
Write-Host "Machines      : $(if ($machinesInBucket) { $machinesInBucket -join ', ' } else { '(none assigned yet)' })"
Write-Host "Credential    : $credentialPath"
Write-Host "Creating as   : $creatingAs" -ForegroundColor Yellow
Write-Host ''
Write-Host 'DPAPI binds this file to the account above, on this machine. Only that account,' -ForegroundColor Yellow
Write-Host 'on this box, will be able to read it.' -ForegroundColor Yellow

# Where a census task is registered, its identity is knowable - so a mismatch is caught here
# rather than at 3am.
$taskAccount = $null
try {
    $censusTask = Get-ScheduledTask -ErrorAction Stop |
        Where-Object { $_.Actions.Arguments -match 'Invoke-Census' } |
        Select-Object -First 1
    if ($censusTask) { $taskAccount = $censusTask.Principal.UserId }
}
catch {
    Write-Verbose "Scheduled tasks could not be enumerated: $($_.Exception.Message)"
}

if ($taskAccount) {
    Write-Host ''
    Write-Host "Census task runs as : $taskAccount"
    $shortCreating = $creatingAs.Split('\')[-1]
    $shortTask     = $taskAccount.Split('\')[-1]
    if ($shortCreating -ne $shortTask -and $taskAccount -notmatch '^(SYSTEM|S-1-5-18)$') {
        Write-Host ''
        Write-Host "MISMATCH: this file would be created as '$creatingAs' but the census runs as" -ForegroundColor Red
        Write-Host "'$taskAccount'. It would fail to decrypt, unattended, for every machine in" -ForegroundColor Red
        Write-Host "this bucket at once." -ForegroundColor Red
        Write-Host ''
        Write-Host "Reach a shell as that account first, then re-run:" -ForegroundColor Red
        Write-Host "    runas /user:$taskAccount powershell.exe" -ForegroundColor Red
        throw "Refusing to create a credential file the census cannot read."
    }
    Write-Host 'Creating account matches the census task account.' -ForegroundColor Green
}
else {
    Write-Host ''
    Write-Host 'No registered census scheduled task found, so the target account cannot be' -ForegroundColor Yellow
    Write-Host 'verified. Make sure the census runs as the account named above.' -ForegroundColor Yellow
}

# --- write it ----------------------------------------------------------------------------
Write-Host ''
$credential = Get-Credential -Message "Credential for census bucket '$BucketId'"
if (-not $credential) { throw 'Cancelled; nothing was written.' }

$credentialDir = Split-Path -Parent $credentialPath
if (-not (Test-Path $credentialDir)) { New-Item -ItemType Directory -Path $credentialDir -Force | Out-Null }

$credential | Export-CliXml -Path $credentialPath

# --- prove it round-trips now, not at 3am ------------------------------------------------
try {
    $readBack = Import-CliXml -Path $credentialPath
}
catch {
    throw "Wrote $credentialPath but could not read it back: $($_.Exception.Message)"
}
if ($readBack.UserName -ne $credential.UserName) {
    throw "Wrote $credentialPath but it read back as a different user ('$($readBack.UserName)')."
}

Write-Host ''
Write-Host "Wrote $credentialPath" -ForegroundColor Green
Write-Host "Verified: reads back as $($readBack.UserName), decrypted by $creatingAs." -ForegroundColor Green

# The directory is git-ignored, but an operator may have pointed the bucket somewhere else.
$repoCreds = Join-Path $scriptRoot 'config\creds'
if (-not $credentialPath.StartsWith($repoCreds, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Warning "$credentialPath is outside config\creds\, which is the directory .gitignore covers. Check it cannot be committed."
}
