<#
    Loads release manifests into the moveit tables (move-it.md §14).

    WHY THIS EXISTS. A manifest is the record of one release: what is in it, which builds
    carry it, what the humans did. Until a form exists this file is the only writer of
    moveit assertions. It is re-runnable: the same manifest twice changes nothing, an edited
    manifest changes only what was edited, and nothing is ever deleted.

    Real manifests live outside this repository (no real data here); the fixtures under
    manifests\demo are fabricated.

    Usage: .\Invoke-AppTrakManifests.ps1 -Path <folder or file> [-Server localhost] [-Database AppTrak] [-By <name>]
#>
param(
    [Parameter(Mandatory)] [string]$Path,
    [string]$Server = 'localhost',
    [string]$Database = 'AppTrak',
    [string]$By = $env:USERNAME
)
$ErrorActionPreference = 'Stop'

$sqlDir = Join-Path $PSScriptRoot 'sql\manifest'
$files = if (Test-Path $Path -PathType Container) { Get-ChildItem $Path -Filter '*.json' | Sort-Object Name } else { Get-Item $Path }
if (-not $files) { throw "No manifests at $Path" }

# ---- SQL plumbing: statements live in sql\manifest\*.sql, values always travel as parameters --

function New-Param([string]$Name, $Value, [System.Data.SqlDbType]$Type) {
    $p = [System.Data.SqlClient.SqlParameter]::new("@$Name", $Type)
    $p.Value = if ($null -eq $Value) { [DBNull]::Value } else { $Value }
    if ($Type -eq [System.Data.SqlDbType]::NVarChar) { $p.Size = -1 }
    return $p
}

function Invoke-Statement($Conn, $Tx, [string]$File, [System.Data.SqlClient.SqlParameter[]]$Params) {
    $cmd = $Conn.CreateCommand()
    $cmd.Transaction = $Tx
    $cmd.CommandText = Get-Content (Join-Path $sqlDir "$File.sql") -Raw
    if ($Params) { $cmd.Parameters.AddRange($Params) }
    $table = [System.Data.DataTable]::new()
    $reader = $cmd.ExecuteReader()
    try { $table.Load($reader) } finally { $reader.Dispose() }
    return ,[object[]]@($table.Rows | ForEach-Object { $_ })
}

# ConvertFrom-Json turns ISO 8601 strings into local DateTimes before we see them; a value
# that arrives that way is taken as the instant it names and stored in UTC.
function Get-Date2($s) {
    if ($null -eq $s -or $s -eq '') { return $null }
    if ($s -is [datetime]) { return $s.Date }
    [datetime]::ParseExact($s, 'yyyy-MM-dd', [cultureinfo]::InvariantCulture)
}
function Get-Instant($s) {
    if ($null -eq $s -or $s -eq '') { return $null }
    if ($s -is [DateTimeOffset]) { return $s }
    if ($s -is [datetime]) { return [DateTimeOffset]::new($s.ToUniversalTime(), [TimeSpan]::Zero) }
    [DateTimeOffset]::Parse($s, [cultureinfo]::InvariantCulture)
}
function Get-Text($s)      { if ($null -eq $s -or $s -eq '') { $null } else { [string]$s } }

# ---- validation against the SelectItem lists, before any write ------------------------------

function Test-Manifest($m, $lists) {
    $errors = [System.Collections.Generic.List[string]]::new()
    if (-not ($m.application -is [int] -or $m.application -is [long])) { $errors.Add('application must be an integer id') }
    if (-not $m.release) { $errors.Add('release (name) is required') }
    if ($m.kind -notin $lists['release-kinds']) { $errors.Add("kind '$($m.kind)' is not in release-kinds") }
    foreach ($w in @($m.workItems | Where-Object { $_ })) {
        if (-not $w.title) { $errors.Add('workItem without a title') }
        if ($w.kind -notin $lists['work-item-kinds']) { $errors.Add("workItem '$($w.title)': kind '$($w.kind)' is not in work-item-kinds") }
        if ($w.foundInStage -and $w.foundInStage -notin $lists['stages']) { $errors.Add("workItem '$($w.title)': foundInStage '$($w.foundInStage)' is not in stages") }
        foreach ($l in @($w.links | Where-Object { $_ })) {
            if ($l.kind -notin $lists['link-kinds']) { $errors.Add("workItem '$($w.title)': link kind '$($l.kind)' is not in link-kinds") }
            if (-not $l.workItem) { $errors.Add("workItem '$($w.title)': link without a target workItem title") }
        }
    }
    foreach ($b in @($m.builds | Where-Object { $_ })) { if (-not $b.build) { $errors.Add('build without a build string') } }
    foreach ($e in @($m.events | Where-Object { $_ })) {
        if ($e.kind -notin $lists['event-kinds']) { $errors.Add("event kind '$($e.kind)' is not in event-kinds") }
        if ($e.stage -and $e.stage -notin $lists['stages']) { $errors.Add("event '$($e.kind)': stage '$($e.stage)' is not in stages") }
        if (-not $e.at) { $errors.Add("event '$($e.kind)' has no 'at'") }
        if (-not $e.by) { $errors.Add("event '$($e.kind)' has no 'by'") }
        try { [void](Get-Instant $e.at) } catch { $errors.Add("event '$($e.kind)': 'at' is not a date-time with offset") }
    }
    if ($m.targetDate) { try { [void](Get-Date2 $m.targetDate) } catch { $errors.Add("targetDate is not yyyy-MM-dd") } }
    return $errors
}

# ---- run ------------------------------------------------------------------------------------

$conn = [System.Data.SqlClient.SqlConnection]::new("Server=$Server;Database=$Database;Integrated Security=True;TrustServerCertificate=True")
$conn.Open()
$failed = 0
try {
    $lists = @{}
    foreach ($row in (Invoke-Statement $conn $null 'lists' @())) {
        if (-not $lists.ContainsKey($row.List)) { $lists[$row.List] = @() }
        $lists[$row.List] += $row.Member
    }

    $loaded = @()   # manifests that passed and were written; links run over these

    # pass 1: release, work items, builds, events — one transaction per manifest
    foreach ($f in $files) {
        Write-Host ''
        Write-Host "== $($f.Name)" -ForegroundColor Cyan
        $m = Get-Content $f.FullName -Raw | ConvertFrom-Json
        $errors = Test-Manifest $m $lists
        if ($errors.Count) {
            $failed++
            $errors | ForEach-Object { Write-Host "   invalid: $_" -ForegroundColor Red }
            continue
        }

        $tx = $conn.BeginTransaction()
        try {
            $r = (Invoke-Statement $conn $tx 'release-upsert' @(
                (New-Param 'ApplicationId' ([int]$m.application) Int),
                (New-Param 'Name' ([string]$m.release) NVarChar),
                (New-Param 'Kind' ([string]$m.kind) NVarChar),
                (New-Param 'TargetDate' (Get-Date2 $m.targetDate) Date),
                (New-Param 'Note' (Get-Text $m.note) NVarChar),
                (New-Param 'By' $By NVarChar)))[0]
            $releaseId = [int]$r.Id

            $wi = @{ inserted = 0; updated = 0; unchanged = 0 }
            foreach ($w in @($m.workItems | Where-Object { $_ })) {
                $o = (Invoke-Statement $conn $tx 'workitem-upsert' @(
                    (New-Param 'ApplicationId' ([int]$m.application) Int),
                    (New-Param 'ReleaseId' $releaseId Int),
                    (New-Param 'Kind' ([string]$w.kind) NVarChar),
                    (New-Param 'Title' ([string]$w.title) NVarChar),
                    (New-Param 'Description' (Get-Text $w.description) NVarChar),
                    (New-Param 'BuiltBy' (Get-Text $w.builtBy) NVarChar),
                    (New-Param 'ExternalRef' (Get-Text $w.externalRef) NVarChar),
                    (New-Param 'IncludedInBuild' (Get-Text $w.includedInBuild) NVarChar),
                    (New-Param 'FoundInStage' (Get-Text $w.foundInStage) NVarChar),
                    (New-Param 'RemovedAt' (Get-Instant $w.removedAt) DateTimeOffset),
                    (New-Param 'RemovedNote' (Get-Text $w.removedNote) NVarChar),
                    (New-Param 'By' $By NVarChar)))[0]
                $wi[$o.Outcome]++
            }
            $inManifest = @($m.workItems | ForEach-Object { $_.title })
            $inDatabase = Invoke-Statement $conn $tx 'workitem-titles' @((New-Param 'ReleaseId' $releaseId Int))
            $orphans = @($inDatabase | Where-Object { $_.Title -notin $inManifest } | ForEach-Object { $_.Title })

            $bd = @{ inserted = 0; updated = 0; unchanged = 0 }
            foreach ($b in @($m.builds | Where-Object { $_ })) {
                $o = (Invoke-Statement $conn $tx 'build-upsert' @(
                    (New-Param 'ReleaseId' $releaseId Int),
                    (New-Param 'Build' ([string]$b.build) NVarChar),
                    (New-Param 'Note' (Get-Text $b.note) NVarChar),
                    (New-Param 'By' $By NVarChar)))[0]
                $bd[$o.Outcome]++
            }

            $ev = @{ inserted = 0; unchanged = 0 }
            foreach ($e in @($m.events | Where-Object { $_ })) {
                $o = (Invoke-Statement $conn $tx 'event-insert' @(
                    (New-Param 'ReleaseId' $releaseId Int),
                    (New-Param 'Kind' ([string]$e.kind) NVarChar),
                    (New-Param 'Stage' (Get-Text $e.stage) NVarChar),
                    (New-Param 'Build' (Get-Text $e.build) NVarChar),
                    (New-Param 'At' (Get-Instant $e.at) DateTimeOffset),
                    (New-Param 'EventBy' ([string]$e.by) NVarChar),
                    (New-Param 'Note' (Get-Text $e.note) NVarChar),
                    (New-Param 'By' $By NVarChar)))[0]
                $ev[$o.Outcome]++
            }

            $tx.Commit()
            Write-Host ("   app {0}, {1}: release {2} | work items +{3} ~{4} ={5} | builds +{6} ~{7} ={8} | events +{9} ={10}" -f
                $m.application, $m.release, $r.Outcome, $wi.inserted, $wi.updated, $wi.unchanged, $bd.inserted, $bd.updated, $bd.unchanged, $ev.inserted, $ev.unchanged)
            if ($orphans) { Write-Host "   in database, not in manifest: $($orphans -join ', ')" -ForegroundColor Yellow }
            $loaded += [pscustomobject]@{ File = $f.Name; Manifest = $m }
        }
        catch {
            $tx.Rollback()
            $failed++
            Write-Host "   failed, rolled back: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    # pass 2: links, once every manifest's work items exist
    foreach ($l in $loaded) {
        $m = $l.Manifest
        $links = @($m.workItems | Where-Object { $_.links } | ForEach-Object { $w = $_; @($w.links) | ForEach-Object { [pscustomobject]@{ From = $w.title; Link = $_ } } })
        if (-not $links) { continue }
        $tx = $conn.BeginTransaction()
        $unresolved = @()
        $lk = @{ inserted = 0; updated = 0; unchanged = 0 }
        try {
            foreach ($x in $links) {
                $from = @(Invoke-Statement $conn $tx 'workitem-find' @(
                    (New-Param 'ApplicationId' ([int]$m.application) Int),
                    (New-Param 'Release' ([string]$m.release) NVarChar),
                    (New-Param 'Title' ([string]$x.From) NVarChar)))
                $toApp = if ($null -ne $x.Link.application) { [int]$x.Link.application } else { [int]$m.application }
                $toRel = if ($x.Link.release) { [string]$x.Link.release } else { [string]$m.release }
                $to = @(Invoke-Statement $conn $tx 'workitem-find' @(
                    (New-Param 'ApplicationId' $toApp Int),
                    (New-Param 'Release' $toRel NVarChar),
                    (New-Param 'Title' ([string]$x.Link.workItem) NVarChar)))
                if (-not $to) { $unresolved += "'$($x.From)' -> app $toApp / $toRel / '$($x.Link.workItem)'"; continue }
                $o = (Invoke-Statement $conn $tx 'link-upsert' @(
                    (New-Param 'WorkItemId' ([int]$from[0].Id) Int),
                    (New-Param 'LinkedWorkItemId' ([int]$to[0].Id) Int),
                    (New-Param 'Kind' ([string]$x.Link.kind) NVarChar),
                    (New-Param 'Note' (Get-Text $x.Link.note) NVarChar),
                    (New-Param 'By' $By NVarChar)))[0]
                $lk[$o.Outcome]++
            }
            $tx.Commit()
            Write-Host ("   {0}: links +{1} ~{2} ={3}" -f $l.File, $lk.inserted, $lk.updated, $lk.unchanged)
            if ($unresolved) {
                $failed++
                $unresolved | ForEach-Object { Write-Host "   unresolved link: $_" -ForegroundColor Red }
            }
        }
        catch {
            $tx.Rollback()
            $failed++
            Write-Host "   links failed, rolled back: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}
finally { $conn.Close() }

Write-Host ''
if ($failed) { Write-Host "$failed manifest(s) with problems" -ForegroundColor Red; exit 1 }
Write-Host "$($loaded.Count) manifest(s) loaded, nothing deleted" -ForegroundColor Green
