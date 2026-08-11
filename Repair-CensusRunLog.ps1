<#
.SYNOPSIS
    One-time migration of a legacy run-log.json to the append-only run-log.jsonl, recovering
    entries the old read-modify-rewrite design mangled and archiving whatever it drops.
.DESCRIPTION
    Until 2026-08-11 the run log was one JSON array that every census run read, appended to,
    and wrote back. Windows PowerShell 5.1 emits a parsed JSON array as a SINGLE pipeline
    object, so the read-back nested the previous day's entries into one
    { "value": [...], "Count": n } element inside the next day's write - and each further run
    nested it a level deeper. The fix is the format: run-log.jsonl, one entry per line,
    appended and never read back by the collector. This script is the bridge from the old
    file to the new one.

    It recovers entries from every shape the old design produced:
      - a well-formed array of entries;
      - the bare-object shape a one-machine run wrote before the -InputObject fix;
      - value/Count nestings from 5.1 read-backs, unwrapped recursively, in file order.

    THE KEEP RULE IS THE READER'S, NOT A SECOND ONE. An entry is kept when it has a non-empty
    'machine' and a non-empty 'outcome' - the two required members of RunLogEntry, and exactly
    what Census.Web requires of a line. Inventing a stricter rule here is how a migration
    starts deleting rows the application would have been happy with.

    NOTHING IS DELETED. Dropped entries go to a timestamped archive, the legacy run-log.json
    is renamed to run-log.migrated-<stamp>.json rather than removed, and neither is ever
    overwritten. If the migration was wrong, everything is still on disk.

    DRY RUN BY DEFAULT. It reports what it would do and changes nothing until -Execute.
.PARAMETER CensusRoot
    Root folder the census writes under. Defaults to .\output next to this script.
.PARAMETER Execute
    Actually write. Without this the script only reports.
.EXAMPLE
    .\Repair-CensusRunLog.ps1

    Reports how many entries would be recovered and dropped. Writes nothing.
.EXAMPLE
    .\Repair-CensusRunLog.ps1 -Execute

    Writes run-log.jsonl, archives unreadable entries, and retires run-log.json.
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

$runLogPath  = Join-Path $CensusRoot '_runs\run-log.json'
$jsonlPath   = Join-Path $CensusRoot '_runs\run-log.jsonl'

# --- read ---------------------------------------------------------------------------------
if (Test-Path $jsonlPath) {
    throw "run-log.jsonl already exists, refusing to overwrite it: $jsonlPath`nIf $runLogPath still holds history to recover, move run-log.jsonl aside first and re-run."
}
if (-not (Test-Path $runLogPath)) { throw "Run log not found: $runLogPath" }

$raw = Get-Content $runLogPath -Raw
if ([string]::IsNullOrWhiteSpace($raw)) { throw "Run log is empty: $runLogPath" }

try {
    $parsed = $raw | ConvertFrom-Json
}
catch {
    throw "Run log is not valid JSON and cannot be migrated automatically: $runLogPath`n$($_.Exception.Message)"
}

# A run log written by a one-machine run before the -InputObject fix is a bare object rather
# than an array. Read off the RAW TEXT: ConvertFrom-Json unwraps a single-element array into
# a scalar, so a correct [ {...} ] file and a broken {...} file parse identically.
$wasBareObject = -not $raw.TrimStart().StartsWith('[')

# --- expand -------------------------------------------------------------------------------
# A 5.1 read-back serialised the previous file's entries as one { value: [...], Count: n }
# element, and the run after that nested the nesting - so unwrap recursively, keeping file
# order, which is run order.
$script:nestingsUnwrapped = 0

function Expand-RunLogNode {
    param($Node)
    if ($Node -is [System.Collections.IEnumerable] -and $Node -isnot [string]) {
        foreach ($item in $Node) { Expand-RunLogNode -Node $item }
        return
    }
    $names = @($Node.PSObject.Properties.Name)
    if ($names.Count -eq 2 -and ($names -contains 'value') -and ($names -contains 'Count')) {
        $script:nestingsUnwrapped++
        Expand-RunLogNode -Node $Node.value
        return
    }
    $Node
}

$entries = @(Expand-RunLogNode -Node $parsed)

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
    Write-Host '           -InputObject fix. Migration recovers it.' -ForegroundColor Yellow
}
if ($script:nestingsUnwrapped -gt 0) {
    Write-Host "  Nesting: $($script:nestingsUnwrapped) value/Count wrapper$(if ($script:nestingsUnwrapped -eq 1) { '' } else { 's' }) from 5.1 read-backs, unwrapped." -ForegroundColor Yellow
}
Write-Host "  Entries: $($entries.Count)"
Write-Host "  Keep:    $($keep.Count)" -ForegroundColor Green
Write-Host "  Drop:    $($drop.Count)" -ForegroundColor $(if ($drop.Count) { 'Yellow' } else { 'Green' })

foreach ($entry in $drop) {
    $fields = ($entry.PSObject.Properties.Name | Select-Object -First 6) -join ', '
    Write-Host "           - unreadable entry, fields: $fields" -ForegroundColor Yellow
}

if (-not $Execute) {
    Write-Host ''
    Write-Host "DRY RUN - nothing written. Re-run with -Execute to write $jsonlPath." -ForegroundColor Cyan
    return
}

# --- write --------------------------------------------------------------------------------
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')

# The archive first, so a failure writing it stops the run before anything else is touched.
if ($drop.Count -gt 0) {
    $archivePath = Join-Path $CensusRoot "_runs\run-log.archive-$stamp.json"
    if (Test-Path $archivePath) { throw "Archive already exists, refusing to overwrite: $archivePath" }

    ConvertTo-Json -InputObject $drop.ToArray() -Depth 10 | Set-Content -Path $archivePath -Encoding utf8
    Write-Host ''
    Write-Host "Archived $($drop.Count) entr$(if ($drop.Count -eq 1) { 'y' } else { 'ies' }) to $archivePath" -ForegroundColor Green
}

# One compressed line per entry - the shape Invoke-Census.ps1 appends from now on.
$lines = foreach ($entry in $keep) {
    ConvertTo-Json -InputObject $entry -Compress -Depth 10
}
Set-Content -Path $jsonlPath -Value $lines -Encoding utf8
Write-Host "Wrote $jsonlPath with $($keep.Count) entr$(if ($keep.Count -eq 1) { 'y' } else { 'ies' })." -ForegroundColor Green

# Retired, not deleted - the reader warns while run-log.json exists with no run-log.jsonl,
# and this rename is what ends the warning.
$retiredPath = Join-Path $CensusRoot "_runs\run-log.migrated-$stamp.json"
if (Test-Path $retiredPath) { throw "Retired copy already exists, refusing to overwrite: $retiredPath" }
Move-Item -Path $runLogPath -Destination $retiredPath
Write-Host "Retired the legacy run log to $retiredPath." -ForegroundColor Green
