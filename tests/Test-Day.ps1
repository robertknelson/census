<#
.SYNOPSIS
    Pins the day endpoint to the demo fixtures (day-view.md section 3 and 10).
.DESCRIPTION
    The demo tree holds three collected days: 2026-07-30 (ten machines), 2026-07-31 (fifteen)
    and 2026-08-01 (BUILDSRV01 alone). Asserted against a running Census.Web on the Demo
    profile: every machine in the universe is one row whatever its status; a day compares a
    machine's snapshot to its previous one whatever that date; a range compares first-in-range
    to last-in-range; the month counts collected and changed per day; the bad asks fail loud.

    Read-only. Start the app first:
      ASPNETCORE_ENVIRONMENT=Demo ASPNETCORE_URLS=http://localhost:5199 dotnet run --no-launch-profile
#>
param(
    [string]$BaseUrl = 'http://localhost:5199'
)
$ErrorActionPreference = 'Stop'

$script:passed = 0
$script:failed = 0
function Assert-That {
    param([string]$Name, [bool]$Condition, $Actual = '')
    if ($Condition) { $script:passed++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else            { $script:failed++; Write-Host "  FAIL  $Name  [actual: $Actual]" -ForegroundColor Red }
}
function Get-Api { param([string]$Path) Invoke-RestMethod -Uri "$BaseUrl$Path" -Method Get }
function Get-Status { param([string]$Path) try { Invoke-WebRequest -Uri "$BaseUrl$Path" -Method Get -SkipHttpErrorCheck | Select-Object -ExpandProperty StatusCode } catch { $_.Exception.Response.StatusCode.value__ } }

# The universe is configured + ever collected (day-view.md section 3), not the canvas's ghosts.
$configured = @(Get-Api '/api/coverage').machine
$collected = @((Get-Api '/api/canvas').machines | Where-Object hasData).machine
$universe = @($configured + $collected) | Sort-Object -Unique

Write-Host 'The default day'
$latest = Get-Api '/api/day'
Assert-That 'is the latest fleet date' ($latest.day -eq '2026-08-01') $latest.day
Assert-That 'every configured or collected machine is a row, once' ((($latest.machines.machine | Sort-Object) -join ',') -eq ($universe -join ',')) ($latest.machines.Count)
$build = $latest.machines | Where-Object machine -eq 'BUILDSRV01'
Assert-That 'BUILDSRV01 changed against 07-31' ($build.status -eq 'changed' -and $build.fromDate -eq '2026-07-31' -and $build.toDate -eq '2026-08-01' -and $build.entries.Count -gt 0) "$($build.status) $($build.fromDate)->$($build.toDate)"
Assert-That 'everyone else was not collected' (@($latest.machines | Where-Object status -eq 'not-collected').Count -eq $universe.Count - 1) (@($latest.machines | Where-Object status -eq 'not-collected').Count)

Write-Host 'A day: 2026-07-31'
$day = Get-Api '/api/day?day=2026-07-31'
$byStatus = $day.machines | Group-Object status -AsHashTable -AsString
Assert-That 'ten changed, five first seen, two not collected, none quiet' (
    @($byStatus['changed']).Count -eq 10 -and @($byStatus['first-seen']).Count -eq 5 -and @($byStatus['not-collected']).Count -eq 2 -and -not $byStatus.ContainsKey('quiet')) (($day.machines | Group-Object status | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ' ')
$web01 = $day.machines | Where-Object machine -eq 'WEB01'
Assert-That 'a changed row names both days and carries entries' ($web01.fromDate -eq '2026-07-30' -and $web01.toDate -eq '2026-07-31' -and $web01.entries.Count -eq 9) "$($web01.fromDate)->$($web01.toDate) $($web01.entries.Count)"
Assert-That 'an entry has section, kind and text' ($web01.entries[0].section -and $web01.entries[0].kind -in @('added', 'removed', 'changed') -and $web01.entries[0].text) ($web01.entries[0] | ConvertTo-Json -Compress)
$first = $day.machines | Where-Object machine -eq 'APPSRV01'
Assert-That 'a first-seen row has only the day it was seen' ($first.status -eq 'first-seen' -and $first.toDate -eq '2026-07-31' -and -not $first.fromDate -and $first.entries.Count -eq 0) ($first | ConvertTo-Json -Compress)
Assert-That 'the decommissioned box is a not-collected row (absence is signal)' (($day.machines | Where-Object machine -eq 'DCBACKUP01').status -eq 'not-collected')

Write-Host 'What it means (findings born and cleared)'
$f = $day.findings
Assert-That 'as of the day against the day before' ($f.before -eq '2026-07-30' -and $f.asOf -eq '2026-07-31') "$($f.before)->$($f.asOf)"
Assert-That '07-31: fifteen born, fourteen cleared' (@($f.born).Count -eq 15 -and @($f.cleared).Count -eq 14) "$(@($f.born).Count)/$(@($f.cleared).Count)"
Assert-That 'the five first-seen machines clear never-collected' (@($f.cleared | Where-Object kind -eq 'never-collected').Count -eq 5 -and (($f.cleared | Where-Object kind -eq 'never-collected').machine -contains 'APPSRV01'))
Assert-That 'the build that landed clears behind-fleet-patch on six' (@($f.cleared | Where-Object kind -eq 'behind-fleet-patch').Count -eq 6)
Assert-That 'a finding carries a key, kind, severity, machine, title' ($f.born[0].key -and $f.born[0].kind -and $f.born[0].severity -and $f.born[0].machine -and $f.born[0].title)
$cert = $f.born | Where-Object kind -eq 'certificate-expiring'
Assert-That 'a key names the thing found, not the drifting title' ($cert.key -like 'certificate-expiring|web01|*' -and $cert.key -notlike '*expires in*') $cert.key
$aug1 = Get-Api '/api/day?day=2026-08-01'
Assert-That '08-01: one born (BUILDSRV01 pending reboot), none cleared' (@($aug1.findings.born).Count -eq 1 -and $aug1.findings.born[0].kind -eq 'pending-reboot' -and $aug1.findings.born[0].machine -eq 'BUILDSRV01' -and @($aug1.findings.cleared).Count -eq 0) ($aug1.findings | ConvertTo-Json -Compress -Depth 3)

Write-Host 'The same rows as the Changes panel'
$feed = Get-Api '/api/changes?from=2026-07-30&to=2026-07-31'
$feedWeb01 = $feed.machines | Where-Object machine -eq 'WEB01'
Assert-That 'WEB01 reads the same on both' ((($web01.entries | ForEach-Object { "$($_.section)|$($_.kind)|$($_.text)" }) -join "`n") -eq (($feedWeb01.entries | ForEach-Object { "$($_.section)|$($_.kind)|$($_.text)" }) -join "`n"))

Write-Host 'Expected or not (installed software against the baseline)'
$added = $web01.entries | Where-Object { $_.section -eq 'apps' -and $_.kind -eq 'added' }
Assert-That 'ASP.NET Core Module V2 landing on WEB01 is a servicing row: not judged' ($added.text -like 'ASP.NET Core Module V2*' -and -not $added.expectation) ($added | ConvertTo-Json -Compress)
$sqlVersion = ($day.machines | Where-Object machine -eq 'SQL01').entries | Where-Object { $_.section -eq 'apps' -and $_.kind -eq 'changed' }
Assert-That 'a version change is not judged' ($sqlVersion.Count -eq 1 -and -not $sqlVersion.expectation) ($sqlVersion | ConvertTo-Json -Compress)
Assert-That 'rows outside installed software carry no expectation' (@($web01.entries | Where-Object { $_.section -ne 'apps' -and $_.expectation }).Count -eq 0)
Assert-That 'the Changes panel never judges' (@($feed.machines.entries | Where-Object expectation).Count -eq 0)

Write-Host 'A range: 07-30 → 08-01'
$range = Get-Api '/api/day?from=2026-07-30&to=2026-08-01'
Assert-That 'a range has no day' (-not $range.day -and $range.from -eq '2026-07-30' -and $range.to -eq '2026-08-01')
$rb = $range.machines | Where-Object machine -eq 'BUILDSRV01'
Assert-That 'first-in-range against last-in-range' ($rb.status -eq 'changed' -and $rb.fromDate -eq '2026-07-31' -and $rb.toDate -eq '2026-08-01') "$($rb.fromDate)->$($rb.toDate)"
Assert-That 'one snapshot in the range is collected-once' (($range.machines | Where-Object machine -eq 'APPSRV01').status -eq 'collected-once')
Assert-That 'a range never says first-seen' (@($range.machines | Where-Object status -eq 'first-seen').Count -eq 0)
Assert-That 'a range diffs the findings as of To against as of From' ($range.findings.before -eq '2026-07-30' -and $range.findings.asOf -eq '2026-08-01' -and @($range.findings.born).Count -eq 16)
$rangeCert = $range.findings.born | Where-Object kind -eq 'certificate-expiring'
Assert-That 'the same certificate has the same key on both, though its title moved a day' ($rangeCert.key -eq $cert.key -and $rangeCert.title -ne $cert.title) "$($rangeCert.title) vs $($cert.title)"

Write-Host 'The month'
$july = Get-Api '/api/day/month?month=2026-07'
Assert-That 'July: two collected days' ($july.Count -eq 2 -and $july[0].day -eq '2026-07-30' -and $july[1].day -eq '2026-07-31') ($july.day -join ',')
Assert-That '07-30 is a first collection: ten collected, none changed' ($july[0].collected -eq 10 -and $july[0].changed -eq 0) "$($july[0].collected)/$($july[0].changed)"
Assert-That '07-31: fifteen collected, ten changed' ($july[1].collected -eq 15 -and $july[1].changed -eq 10) "$($july[1].collected)/$($july[1].changed)"
$aug = Get-Api '/api/day/month?month=2026-08'
Assert-That 'August: one day, one machine, changed' ($aug.Count -eq 1 -and $aug[0].collected -eq 1 -and $aug[0].changed -eq 1) ($aug | ConvertTo-Json -Compress)
Assert-That 'an empty month is an empty list' ((Invoke-WebRequest -Uri "$BaseUrl/api/day/month?month=2026-09").Content -eq '[]')

Write-Host 'Bad asks fail loud'
Assert-That 'a day and a range together is 400' ((Get-Status '/api/day?day=2026-07-31&from=2026-07-30&to=2026-07-31') -eq 400)
Assert-That 'from after to is 400' ((Get-Status '/api/day?from=2026-08-01&to=2026-07-30') -eq 400)
Assert-That 'a malformed day is 400' ((Get-Status '/api/day?day=31-07-2026') -eq 400)
Assert-That 'a malformed month is 400' ((Get-Status '/api/day/month?month=2026') -eq 400)
Assert-That 'the page is served' ((Get-Status '/day') -eq 200)

Write-Host ''
Write-Host "$($script:passed) passed, $($script:failed) failed" -ForegroundColor $(if ($script:failed) { 'Red' } else { 'Green' })
exit $(if ($script:failed) { 1 } else { 0 })
