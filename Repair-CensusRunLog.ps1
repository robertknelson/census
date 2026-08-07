<#
.SYNOPSIS
    Rewrites a run log so it holds only entries the reader can read, archiving whatever it
    drops rather than deleting it.
.DESCRIPTION
    The run log accumulates shapes. Every census run reads the existing file and copies each
    entry forward verbatim, so an entry written by an older collector stays in the file
    permanently - no later run cleans it out. Census.Web survives that (it skips entries that
    no longer fit and logs a count), but the warning then repeats on every read forever.

    This script is the one-time cleanup. It partitions the file into entries the reader can
    load and entries it cannot, writes the unreadable ones to a timestamped archive beside the
    run log, and rewrites the run log with the rest.

    THE RULE IS THE READER'S, NOT A SECOND ONE. An entry is kept when it has a non-empty
    'machine' and a non-empty 'outcome' - the two required members of RunLogEntry, and exactly
    what makes Census.Web skip an entry. Inventing a stricter rule here is how a migration
    starts deleting rows the application would have been happy with.

    NOTHING IS DELETED. Dropped entries go to the archive file, and the archive is never
    overwritten. If you decide the migration was wrong, the entries are still on disk.

    DRY RUN BY DEFAULT. It reports what it would do and changes nothing until -Execute.
.PARAMETER CensusRoot
    Root folder the census writes under. Defaults to .\output next to this script.
.PARAMETER Execute
    Actually write. Without this the script only reports.
.EXAMPLE
    .\Repair-CensusRunLog.ps1

    Reports how many entries would be kept and dropped. Writes nothing.
.EXAMPLE
    .\Repair-CensusRunLog.ps1 -Execute

    Archives the unreadable entries and rewrites the run log.
#>
[CmdletBinding()]
param(
    [string]$CensusRoot,
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'

$scriptRoot = $PSScriptRoot
if (-not $scriptRoot) {
    if ($PSCommandPath) { $scriptRoot = Split-Path -Parent $PSCommandPath }
    else                { $scriptRoot = (Get-Location).Path }
}
if (-not $CensusRoot) { $CensusRoot = Join-Path $scriptRoot 'output' }

$runLogPath = Join-Path $CensusRoot '_runs\run-log.json'

# --- read ---------------------------------------------------------------------------------
if (-not (Test-Path $runLogPath)) { throw "Run log not found: $runLogPath" }

$raw = Get-Content $runLogPath -Raw
if ([string]::IsNullOrWhiteSpace($raw)) { throw "Run log is empty: $runLogPath" }

try {
    $parsed = $raw | ConvertFrom-Json
}
catch {
    throw "Run log is not valid JSON and cannot be repaired automatically: $runLogPath`n$($_.Exception.Message)"
}

# A run log written by a one-machine run before the -InputObject fix is a bare object rather
# than an array. @() normalises that, which also repairs it on the way through.
$entries = @($parsed)

# The shape has to be read off the RAW TEXT, not off $parsed. ConvertFrom-Json unwraps a
# single-element array into a scalar, so a correct [ {...} ] file and a broken {...} file both
# come back as one object - and testing $parsed would report every one-entry run log as
# damaged and "repair" it on every run.
$wasBareObject = -not $raw.TrimStart().StartsWith('[')

# --- partition ----------------------------------------------------------------------------
$keep = New-Object System.Collections.Generic.List[object]
$drop = New-Object System.Collections.Generic.List[object]

foreach ($entry in $entries) {
    $hasMachine = $entry.PSObject.Properties.Name -contains 'machine' -and
                  -not [string]::IsNullOrWhiteSpace($entry.machine)
    $hasOutcome = $entry.PSObject.Properties.Name -contains 'outcome' -and
                  -not [string]::IsNullOrWhiteSpace($entry.outcome)

    if ($hasMachine -and $hasOutcome) { $keep.Add($entry) } else { $drop.Add($entry) }
}

# --- report -------------------------------------------------------------------------------
Write-Host ''
Write-Host "Run log: $runLogPath"
if ($wasBareObject) {
    Write-Host '  Shape:   a bare object, not an array - a one-machine run written before the' -ForegroundColor Yellow
    Write-Host '           -InputObject fix. Rewriting repairs it.' -ForegroundColor Yellow
}
Write-Host "  Entries: $($entries.Count)"
Write-Host "  Keep:    $($keep.Count)" -ForegroundColor Green
Write-Host "  Drop:    $($drop.Count)" -ForegroundColor $(if ($drop.Count) { 'Yellow' } else { 'Green' })

foreach ($entry in $drop) {
    $fields = ($entry.PSObject.Properties.Name | Select-Object -First 6) -join ', '
    Write-Host "           - unreadable entry, fields: $fields" -ForegroundColor Yellow
}

if ($drop.Count -eq 0 -and -not $wasBareObject) {
    Write-Host ''
    Write-Host 'Nothing to repair.' -ForegroundColor Green
    return
}

if (-not $Execute) {
    Write-Host ''
    Write-Host 'DRY RUN - nothing written. Re-run with -Execute to apply.' -ForegroundColor Cyan
    return
}

# --- write --------------------------------------------------------------------------------
# The archive first, so a failure writing it stops the run before the run log is touched.
if ($drop.Count -gt 0) {
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
    $archivePath = Join-Path $CensusRoot "_runs\run-log.archive-$stamp.json"
    if (Test-Path $archivePath) { throw "Archive already exists, refusing to overwrite: $archivePath" }

    ConvertTo-Json -InputObject $drop.ToArray() -Depth 10 | Set-Content -Path $archivePath -Encoding utf8
    Write-Host ''
    Write-Host "Archived $($drop.Count) entr$(if ($drop.Count -eq 1) { 'y' } else { 'ies' }) to $archivePath" -ForegroundColor Green
}

# -InputObject on an explicit array, never the pipeline: piping unrolls the collection and a
# single remaining entry would serialise as a bare object - the shape this script exists to
# clean up. See requirements.md 4.2.
ConvertTo-Json -InputObject $keep.ToArray() -Depth 10 | Set-Content -Path $runLogPath -Encoding utf8
Write-Host "Rewrote run log with $($keep.Count) entr$(if ($keep.Count -eq 1) { 'y' } else { 'ies' })." -ForegroundColor Green
