<#
.SYNOPSIS
    Pins every Move It question to its answer on the fixtures (move-it.md section 22).
.DESCRIPTION
    Each question in apptrak/sql carries a rule that was argued for and verified by hand once:
    the location rule (01, shared with 13), what a rollback is (08), only the stages seen
    (17 item 4), the first-ping rule (21), the inbox (05), sign-off (12). An edit to any of
    them can change an answer without an error. This rebuilds the demo database from the seed
    and asserts the answers the seed was built to produce, named by the rule they prove.

    Read-only against the questions; it does rebuild the local demo database (AppTrak on
    localhost by default) through Invoke-AppTrakDemo.ps1. -SkipRebuild reuses what is there.
    Never point it at the real server: the rebuild deletes and reseeds demo rows.
#>
param(
    [string]$Server = 'localhost',
    [string]$Database = 'AppTrak',
    [switch]$SkipRebuild
)
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$sql = Join-Path $repo 'apptrak\sql'

$script:passed = 0
$script:failed = 0
function Assert-That {
    param([string]$Name, [bool]$Condition, $Actual = '')
    if ($Condition) { $script:passed++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else            { $script:failed++; Write-Host "  FAIL  $Name  [actual: $Actual]" -ForegroundColor Red }
}

function Invoke-File {
    param([string]$Relative)
    $connection = New-Object System.Data.SqlClient.SqlConnection "Server=$Server;Database=$Database;Integrated Security=true"
    $connection.Open()
    try {
        $command = $connection.CreateCommand()
        $command.CommandText = [IO.File]::ReadAllText((Join-Path $sql $Relative))
        $command.CommandTimeout = 300
        $set = New-Object System.Data.DataSet
        (New-Object System.Data.SqlClient.SqlDataAdapter $command).Fill($set) | Out-Null
        return , $set.Tables
    }
    finally { $connection.Close() }
}

function Invoke-Scalar {
    param([string]$Text)
    $connection = New-Object System.Data.SqlClient.SqlConnection "Server=$Server;Database=$Database;Integrated Security=true"
    $connection.Open()
    try { $command = $connection.CreateCommand(); $command.CommandText = $Text; return $command.ExecuteScalar() }
    finally { $connection.Close() }
}

function Rows { param($Table, [scriptblock]$Where = { $true }) @($Table.Rows | Where-Object $Where) }
function Same { param($A, $B) (@($A | Sort-Object) -join ',') -eq (@($B | Sort-Object) -join ',') }

if (-not $SkipRebuild) {
    Write-Host 'Rebuilding the demo database from the seed...' -ForegroundColor Cyan
    & (Join-Path $repo 'apptrak\Invoke-AppTrakDemo.ps1') -Server $Server -Database $Database | Out-Null
}

Write-Host "`nThe backfill (10.1, 21.1)" -ForegroundColor Cyan
$before = Invoke-Scalar 'SELECT COUNT(*) FROM moveit.Deployment'
$runs = Invoke-Scalar 'SELECT COUNT(*) FROM moveit.BackfillRun'
Invoke-File 'backfill-deployment.sql' | Out-Null
Assert-That 'a second run inserts nothing' ((Invoke-Scalar 'SELECT COUNT(*) FROM moveit.Deployment') -eq $before) $before
Assert-That 'and stamps its run' ((Invoke-Scalar 'SELECT COUNT(*) FROM moveit.BackfillRun') -eq $runs + 1) $runs
$through = Invoke-Scalar 'SELECT TOP 1 ThroughAt FROM moveit.BackfillRun ORDER BY Id DESC'
Assert-That 'stamped through the last seeded ping' ($through -eq [DateTimeOffset]'2026-09-13T23:50:00+00:00') $through

Write-Host "`nOnly the stages seen (17 item 4)" -ForegroundColor Cyan
$stages = (Invoke-File 'board\stages.sql')[0]
Assert-That 'DEV, VAL, UAT, PROD - LOCAL and TRAIN, registered nowhere, are left out' (Same ($stages.Rows | ForEach-Object Stage) @('DEV', 'VAL', 'UAT', 'PROD')) (($stages.Rows | ForEach-Object Stage) -join ',')

Write-Host "`n01 - the location rule" -ForegroundColor Cyan
$items = (Invoke-File 'questions\01-where-is-everything.sql')[0]
$located = @{}; foreach ($r in $items.Rows) { $located[[int]$r.WorkItemId] = "$($r.Status)/$($r.Evidence)" }
$expected = @{
    101 = 'PROD/observed'; 102 = 'PROD/observed'; 103 = 'PROD/observed'; 201 = 'PROD/observed'
    104 = 'removed/'
    301 = 'DEV/observed'; 302 = 'DEV/observed'
    303 = 'with the devs/'
    401 = 'PROD/observed'; 501 = 'PROD/observed'
    601 = 'PROD/asserted'; 602 = 'PROD/asserted'; 901 = 'UAT/asserted'; 1001 = 'UAT/asserted'
    701 = 'VAL/observed'
    801 = 'no evidence/'
    1101 = 'no release/'; 1102 = 'no release/'; 1103 = 'no release/'
}
Assert-That 'every item, nothing extra' ($items.Rows.Count -eq $expected.Count) $items.Rows.Count
$wrong = @($expected.Keys | Where-Object { $located[$_] -ne $expected[$_] } | ForEach-Object { "$_=$($located[$_])" })
Assert-That 'a rollback takes Sprint 43 back to DEV and Reporting refresh back to VAL; asserted moves stay asserted; heard items read no release' ($wrong.Count -eq 0) ($wrong -join '; ')

Write-Host "`n02 - release status" -ForegroundColor Cyan
$releases = (Invoke-File 'questions\02-release-status.sql')[0]
$stage = @{}; foreach ($r in $releases.Rows) { $stage[[int]$r.ReleaseId] = $r.HighestStage }
$want = @{ 1 = 'PROD'; 2 = 'PROD'; 3 = 'DEV'; 4 = 'PROD'; 5 = 'PROD'; 6 = 'PROD'; 7 = 'VAL'; 8 = 'no evidence'; 9 = 'UAT'; 10 = 'UAT' }
$wrong = @($want.Keys | Where-Object { $stage[$_] -ne $want[$_] } | ForEach-Object { "$_=$($stage[$_])" })
Assert-That 'highest stage per release, by 01''s rule across its items' ($wrong.Count -eq 0) ($wrong -join '; ')
Assert-That 'on hold: Sprint 43 (WidgetCore) and Reporting refresh' (Same (Rows $releases { $_.OnHold -eq 1 } | ForEach-Object ReleaseId) @(3, 7)) ((Rows $releases { $_.OnHold -eq 1 } | ForEach-Object ReleaseId) -join ',')

Write-Host "`n03 - order violations (rule 7)" -ForegroundColor Cyan
$order = (Invoke-File 'questions\03-order-violations.sql')[0]
Assert-That 'now: Audit viewer in PROD and Rate-change letters in UAT ahead of what they depend on' (Same (Rows $order { $_.Violation -eq 'current' } | ForEach-Object { "$($_.Dependent)@$($_.DependentStage)" }) @('Audit viewer@PROD', 'Rate-change letters@UAT')) (($order.Rows | ForEach-Object { "$($_.Violation):$($_.Dependent)" }) -join ',')
Assert-That 'ever: Portfolio dashboard and Audit viewer' (Same (Rows $order { $_.Violation -eq 'historical' } | ForEach-Object Dependent) @('Portfolio dashboard', 'Audit viewer')) ''

Write-Host "`n04 - ready for client approval" -ForegroundColor Cyan
$ready = (Invoke-File 'questions\04-ready-to-approve.sql')[0]
Assert-That 'Q4 statements ready' (@(Rows $ready { $_.ReleaseId -eq 9 -and $_.Ready -eq 1 }).Count -eq 1) ''
Assert-That 'Q4 letters blocked by the fix still with the devs' (@(Rows $ready { $_.ReleaseId -eq 10 -and $_.Ready -eq 0 -and "$($_.Blockers)" -like '*Timezone in scheduled reports*' }).Count -eq 1) (($ready.Rows | ForEach-Object { "$($_.ReleaseId):$($_.Ready):$($_.Blockers)" }) -join '; ')

Write-Host "`n05 - the inbox" -ForegroundColor Cyan
$inbox = (Invoke-File 'questions\05-inbox-unattributed-builds.sql')[0]
$kinds = $inbox.Rows | Group-Object Item | ForEach-Object { "$($_.Name)=$($_.Count)" }
Assert-That 'three unnamed VAL builds, the same three in PROD, one attributed build never seen' (Same $kinds @('attach a manifest=3', 'PROD without manifest=3', 'attributed, unseen=1')) ($kinds -join ', ')

Write-Host "`n06 / 07 - the four voices, multi-server" -ForegroundColor Cyan
$mismatch = (Invoke-File 'questions\06-stage-mismatch.sql')[0]
Assert-That 'WidgetPortal VAL (endpoint 22) says it is PROD' ($mismatch.Rows.Count -eq 1 -and $mismatch.Rows[0].EndpointId -eq 22 -and $mismatch.Rows[0].ReportedStage -eq 'PROD') $mismatch.Rows.Count
$disagree = (Invoke-File 'questions\07-servers-disagree.sql')
Assert-That 'no stage disagrees now; WidgetCore PROD did once' ($disagree[0].Rows.Count -eq 0 -and $disagree[1].Rows.Count -eq 1 -and $disagree[1].Rows[0].ApplicationId -eq 1) "$($disagree[0].Rows.Count)/$($disagree[1].Rows.Count)"

Write-Host "`n08 - what a rollback is" -ForegroundColor Cyan
$rollbacks = (Invoke-File 'questions\08-rollbacks.sql')[0]
$seen = $rollbacks.Rows | ForEach-Object { "$($_.ApplicationId):$($_.RolledBackFrom)>$($_.RolledBackTo):$($_.Variant.Substring(0,1))" }
Assert-That 'WidgetCore PROD variant A on both servers, Reporting PROD variant B; a machine move is not one' (Same $seen @('1:20260820.4>20260815.1:A', '1:20260820.4>20260815.1:A', '5:20260720.2>20260701.1:B')) ($seen -join ', ')

Write-Host "`n09 / 10 / 11 / 12" -ForegroundColor Cyan
$lead = (Invoke-File 'questions\09-lead-time.sql')[0]
Assert-That '09: lead time for every release with evidence (not Ledger cleanup)' ($lead.Rows.Count -eq 9 -and -not (Rows $lead { $_.ReleaseId -eq 8 })) $lead.Rows.Count
$hotfix = (Invoke-File 'questions\10-hotfixes.sql')[0]
Assert-That '10: one hotfix, the login timeout' ($hotfix.Rows.Count -eq 1 -and $hotfix.Rows[0].ReleaseId -eq 2) $hotfix.Rows.Count
$coverage = (Invoke-File 'questions\11-regime-coverage.sql')[0]
$verdicts = $coverage.Rows | ForEach-Object { "$($_.ApplicationId)=$($_.Verdict)" }
Assert-That '11: three observed, Ledger pinged without a block, Team A asserted only' (Same $verdicts @('1=observed', '2=observed', '5=observed', '3=pinged, no block', '4=asserted only')) ($verdicts -join ', ')
$approval = (Invoke-File 'questions\12-approval-vs-prod.sql')[0]
$found = $approval.Rows | ForEach-Object { "$($_.ReleaseId)=$($_.Item)" }
Assert-That '12: WidgetPortal Sprint 42 reached PROD unapproved; the hotfix deployed before its approval' (Same $found @('1=approved -> PROD', '3=approved -> PROD', '5=approved -> PROD', '6=approved -> PROD', '7=approved -> PROD', '2=deployed before approval', '4=PROD without approval')) ($found -join ', ')

Write-Host "`n13 - the feature picture" -ForegroundColor Cyan
$picture = (Invoke-File 'questions\13-feature-picture.sql')[0]
$json = ($picture.Rows | ForEach-Object { $_[0] }) -join ''
$features = $json | ConvertFrom-Json
Assert-That 'one JSON document, every item' (@($features).Count -eq 19) @($features).Count

Write-Host "`nThe calendar (21)" -ForegroundColor Cyan
$calendar = (Invoke-File 'board\calendar.sql')[0]
$t0 = [DateTimeOffset]'2026-07-06T00:00:00+00:00'
Assert-That 'no build "arrives" at an endpoint''s first ping' (@(Rows $calendar { $_.Kind -eq 'arrived' -and $_.At -eq $t0 }).Count -eq 0) ''
Assert-That 'three rollback rows (WidgetCore on two servers, Reporting)' (@(Rows $calendar { $_.Kind -eq 'returned' }).Count -eq 3) ''
Assert-That 'notes are not drawn' (@(Rows $calendar { $_.EventKind -eq 'note' }).Count -eq 0) ''
$recorded = @(Rows $calendar { $_.Kind -eq 'recorded-through' })
Assert-That 'recorded through the backfill''s stamp' ($recorded.Count -eq 1 -and $recorded[0].Source -eq 'backfill' -and $recorded[0].At -eq [DateTimeOffset]'2026-09-13T23:50:00+00:00') "$($recorded[0].Source) $($recorded[0].At)"

Write-Host ''
$colour = if ($script:failed -eq 0) { 'Green' } else { 'Red' }
Write-Host "$($script:passed) passed, $($script:failed) failed" -ForegroundColor $colour
if ($script:failed -gt 0) { exit 1 }
