<#
.SYNOPSIS
    Pins scoped ownership (census-on-apptrak.md §7, D-004) against a running Census.Web.
.DESCRIPTION
    Signed in as you (a system administrator, appsettings.Local.json), it impersonates demo-paula (product owner on
    WidgetCore and Reporting) and demo-max (product owner on MortgageGateway, technical lead on Reporting), and checks
    that every Move It read holds their applications only, and that every write outside them is refused (403) on both
    surfaces: the curate API (api/edit) and Move It's entry (api/moveit). What it creates it deletes again. Stops
    impersonating at the end. Needs apptrak/sql/fm/003-owners-curate.sql run once. Never point it at the real server.
#>
param(
    [string]$BaseUrl = 'http://localhost:5292',
    [string]$Server = 'localhost',
    [string]$Database = 'AppTrak'
)
$ErrorActionPreference = 'Stop'

$script:passed = 0
$script:failed = 0
function Assert-That {
    param([string]$Name, [bool]$Condition, $Actual = '')
    if ($Condition) { $script:passed++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else            { $script:failed++; Write-Host "  FAIL  $Name  [actual: $Actual]" -ForegroundColor Red }
}
$c = @{ UseDefaultCredentials = $true; AllowUnencryptedAuthentication = $true; SkipHttpErrorCheck = $true }
function Post([string]$Path, $Body = @{}) {
    $r = Invoke-WebRequest -Uri "$BaseUrl$Path" -Method Post -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 5) @c
    return @{ Status = [int]$r.StatusCode; Body = if ($r.Content) { $r.Content | ConvertFrom-Json } else { $null } }
}
function Get-Api([string]$Path) { $r = Invoke-WebRequest -Uri "$BaseUrl$Path" @c; @{ Status = [int]$r.StatusCode; Rows = @(($r.Content | ConvertFrom-Json) | ForEach-Object { $_ }) } }
function Sql([string]$Text) {
    $conn = [System.Data.SqlClient.SqlConnection]::new("Server=$Server;Database=$Database;Integrated Security=true;TrustServerCertificate=true")
    $conn.Open()
    try { $m = $conn.CreateCommand(); $m.CommandText = $Text; $t = [System.Data.DataTable]::new(); $rd = $m.ExecuteReader(); try { $t.Load($rd) } finally { $rd.Dispose() }; return ,[object[]]@($t.Rows | ForEach-Object { $_ }) }
    finally { $conn.Dispose() }
}
function Apps([object[]]$Rows, [string]$Column = 'ApplicationId') { @($Rows | ForEach-Object { [int]$_.$Column } | Sort-Object -Unique) }
function Within([int[]]$Seen, [int[]]$Allowed) { @($Seen | Where-Object { $_ -notin $Allowed }).Count -eq 0 }

$releaseApp = @{}; (Sql 'SELECT Id, ApplicationId FROM moveit.Release') | ForEach-Object { $releaseApp[[int]$_.Id] = [int]$_.ApplicationId }
$other = (Sql 'SELECT TOP 1 Id, ApplicationId FROM moveit.Release WHERE ApplicationId = 4 ORDER BY Id')[0]
$otherItem = (Sql 'SELECT TOP 1 Id FROM moveit.WorkItem WHERE ApplicationId = 4 ORDER BY Id')[0].Id
$build = (Sql 'SELECT TOP 1 Build FROM moveit.Deployment WHERE ApplicationId = 1')[0].Build

try {
    Write-Host 'As demo-paula: WidgetCore (1) and Reporting (5)'
    Assert-That 'impersonate demo-paula' ((Post '/api/impersonation' @{ identifier = 'demo-paula' }).Status -eq 200)
    $mine = 1, 5
    $w = (Invoke-WebRequest "$BaseUrl/api/moveit/writes" @c).Content | ConvertFrom-Json
    Assert-That 'writes: releases and features on hers, nothing else' (((@($w.'curate.releases') | Sort-Object) -join ',') -eq '1,5' -and ((@($w.'curate.feature-sets') | Sort-Object) -join ',') -eq '1,5' -and @($w.'curate.associations').Count -eq 0 -and @($w.'curate.events').Count -eq 0) ($w | ConvertTo-Json -Compress)

    foreach ($p in '/api/moveit/applications', '/api/moveit/releases', '/api/moveit/history', '/api/moveit/builds-seen', '/api/moveit/coverage', '/api/moveit/calendar', '/api/moveit/where-is-everything', '/api/moveit/release-status', '/api/moveit/approval-vs-prod', '/api/personas/lead-time', '/api/edit/releases', '/api/edit/workitems') {
        $r = Get-Api $p
        $seen = Apps ($r.Rows | Where-Object { $null -ne $_.ApplicationId })
        Assert-That "$p holds hers only" ($r.Status -eq 200 -and (Within $seen $mine)) ($seen -join ',')
    }
    foreach ($p in '/api/moveit/events', '/api/moveit/release-builds', '/api/moveit/release-build-history', '/api/edit/builds', '/api/edit/events') {
        $r = Get-Api $p
        $seen = @($r.Rows | ForEach-Object { $releaseApp[[int]$_.ReleaseId] } | Sort-Object -Unique)
        Assert-That "$p holds her releases only" ($r.Status -eq 200 -and (Within $seen $mine)) ($seen -join ',')
    }
    $audit = Get-Api '/api/edit/audit-recent'
    $seen = @($audit.Rows | Where-Object { $_.ReleaseId } | ForEach-Object { $releaseApp[[int]$_.ReleaseId] } | Sort-Object -Unique)
    Assert-That 'recent corrections: her releases only' (Within $seen $mine) ($seen -join ',')
    $picture = (Invoke-WebRequest "$BaseUrl/api/moveit/feature-picture" @c).Content | ConvertFrom-Json
    $seen = @($picture | ForEach-Object { [int]$_.application.id } | Sort-Object -Unique)
    Assert-That 'feature picture: her applications only, and not empty' ($seen.Count -gt 0 -and (Within $seen $mine)) ($seen -join ',')
    Assert-That "another application's release history: 404" ((Invoke-WebRequest "$BaseUrl/api/edit/audit/release/$($other.Id)" @c).StatusCode -eq 404)

    Write-Host '  Writes on the curate API'
    Assert-That 'create a release on MortgageGateway (4): 403' ((Post '/api/edit/release' @{ applicationId = 4; name = 'Test-Ownership'; kind = 'featureset' }).Status -eq 403)
    $own = Post '/api/edit/release' @{ applicationId = 1; name = 'Test-Ownership'; kind = 'featureset' }
    Assert-That 'create one on WidgetCore (1): 200' ($own.Status -eq 200) "$($own.Status) $($own.Body.errors)"
    $ownId = [int]$own.Body.key
    Assert-That 'move hers to MortgageGateway: 403' ((Post "/api/edit/release/$ownId" @{ applicationId = 4; name = 'Test-Ownership'; kind = 'featureset' }).Status -eq 403)
    Assert-That 'correct a MortgageGateway release: 403' ((Post "/api/edit/release/$($other.Id)" @{ applicationId = 1; name = 'taken'; kind = 'featureset' }).Status -eq 403)
    Assert-That 'delete a MortgageGateway release: 403' ((Post "/api/edit/release/$($other.Id)/delete").Status -eq 403)
    Assert-That 'an item on MortgageGateway: 403' ((Post '/api/edit/workitem' @{ applicationId = 4; kind = 'feature'; title = 'Test-Ownership' }).Status -eq 403)
    $item = Post '/api/edit/workitem' @{ applicationId = 1; releaseId = $ownId; kind = 'feature'; title = 'Test-Ownership item' }
    Assert-That 'an item in her release: 200' ($item.Status -eq 200) "$($item.Status) $($item.Body.errors)"
    Assert-That 'her item into a MortgageGateway release: 403' ((Post "/api/edit/workitem/$($item.Body.key)" @{ applicationId = 1; releaseId = $other.Id; kind = 'feature'; title = 'Test-Ownership item' }).Status -eq 403)
    Assert-That 'claim a build (no curate.associations): 403' ((Post '/api/edit/build' @{ releaseId = $ownId; build = 'T-OWN' }).Status -eq 403)
    Assert-That 'record an event (no curate.events): 403' ((Post '/api/edit/event' @{ releaseId = $ownId; kind = 'note'; at = '2026-11-05T10:00:00Z'; by = 'paula' }).Status -eq 403)
    Assert-That 'a link from a MortgageGateway item: 403' ((Post '/api/edit/link' @{ workItemId = $otherItem; linkedWorkItemId = [int]$item.Body.key; kind = 'depends-on' }).Status -eq 403)

    Write-Host '  Writes on Move It''s entry'
    Assert-That 'name a build on MortgageGateway: 403' ((Post '/api/moveit/name-build' @{ applicationId = 4; release = @{ name = 'Test-Ownership'; kind = 'featureset' } }).Status -eq 403)
    Assert-That 'add what is coming on MortgageGateway: 403' ((Post '/api/moveit/add-item' @{ applicationId = 4; kind = 'feature'; title = 'Test-Ownership' }).Status -eq 403)
    Assert-That 'rename a MortgageGateway item: 403' ((Post '/api/moveit/retitle' @{ workItemId = $otherItem; title = 'taken' }).Status -eq 403)
    Assert-That 'pull a MortgageGateway item: 403' ((Post '/api/moveit/pull-item' @{ workItemId = $otherItem }).Status -eq 403)
    Assert-That 'delete a MortgageGateway release: 403' ((Post '/api/moveit/delete-release' @{ releaseId = $other.Id }).Status -eq 403)
    Assert-That 'claim a build on hers (no curate.associations): 403' ((Post '/api/moveit/claim-build' @{ releaseId = $ownId; build = $build }).Status -eq 403)
    Assert-That 'an event on hers (no curate.events): 403' ((Post '/api/moveit/event' @{ releaseId = $ownId; kind = 'note'; at = '2026-11-05T10:00:00Z'; by = 'paula' }).Status -eq 403)
    $renamed = Post '/api/moveit/retitle' @{ workItemId = [int]$item.Body.key; title = 'Test-Ownership item, renamed' }
    Assert-That 'rename her own item: 200' ($renamed.Status -eq 200) $renamed.Status
    Assert-That 'delete her release: 200' ((Post "/api/edit/release/$ownId/delete").Status -eq 200)
    Assert-That 'a release that is gone: 403, as one that is not hers' ((Post "/api/edit/release/$ownId/delete").Status -eq 403)

    Write-Host '  The pages her features do not offer, refused on the server too'
    $status = { param($p) [int](Invoke-WebRequest -Uri "$BaseUrl$p" @c).StatusCode }
    Assert-That 'Log Explorer page and API: 403' ((& $status '/logs') -eq 403 -and (& $status '/api/logs/api-request/search?log-start=2026-10-01&log-end=2026-10-02') -eq 403)
    Assert-That 'Trace page and API: 403' ((& $status '/trace') -eq 403 -and (& $status '/api/trace/people?from=2026-10-01&to=2026-10-02') -eq 403)
    Assert-That 'Usage, which she holds: 200' ((& $status '/usage') -eq 200 -and (& $status '/api/usage/applications?from=2026-10-01&to=2026-10-02') -eq 200)
    $ua = @((Invoke-WebRequest -Uri "$BaseUrl/api/usage/applications?from=2026-09-23&to=2026-10-23" @c).Content | ConvertFrom-Json | ForEach-Object { $_.application } | Sort-Object -Unique)
    Assert-That 'Usage lists her applications only (by name or identifier)' ($ua.Count -gt 0 -and @($ua | Where-Object { $_ -notin 'WidgetCore', 'Reporting', 'widgetcore', 'reporting' }).Count -eq 0) ($ua -join ',')
    $us = @((Invoke-WebRequest -Uri "$BaseUrl/api/usage/summary?from=2026-09-23&to=2026-10-23" @c).Content | ConvertFrom-Json | ForEach-Object { $_.application })
    Assert-That 'the Usage summary too' ($us.Count -gt 0 -and @($us | Where-Object { $_ -notin 'WidgetCore', 'Reporting' }).Count -eq 0) ($us -join ',')
    Assert-That "another application's Usage section: 403" ((& $status '/api/usage/overview?application=LedgerService&stage=PROD&from=2026-09-23&to=2026-10-23') -eq 403)
    Assert-That 'her own: 200' ((& $status '/api/usage/overview?application=WidgetCore&stage=PROD&from=2026-09-23&to=2026-10-23') -eq 200)

    Write-Host 'As demo-max: product owner on MortgageGateway (4), technical lead on Reporting (5)'
    Assert-That 'impersonate demo-max' ((Post '/api/impersonation' @{ identifier = 'demo-max' }).Status -eq 200)
    $seen = Apps (Get-Api '/api/moveit/releases').Rows
    Assert-That 'releases: MortgageGateway and Reporting only' (Within $seen @(4, 5)) ($seen -join ',')
    Assert-That 'a release on Reporting, where he leads but does not own: 403' ((Post '/api/edit/release' @{ applicationId = 5; name = 'Test-Ownership'; kind = 'featureset' }).Status -eq 403)
    $his = Post '/api/edit/release' @{ applicationId = 4; name = 'Test-Ownership'; kind = 'featureset' }
    Assert-That 'a release on MortgageGateway: 200, then deleted' ($his.Status -eq 200 -and (Post "/api/edit/release/$($his.Body.key)/delete").Status -eq 200) $his.Status
}
finally {
    $stop = Post '/api/impersonation/stop'
    Write-Host 'As yourself (a system administrator, not impersonating)'
    Assert-That 'stop impersonating' ($stop.Status -eq 200)
    $all = Apps (Get-Api '/api/moveit/releases').Rows
    $db = Apps (Sql 'SELECT ApplicationId FROM moveit.Release')
    Assert-That 'every application''s releases, untrimmed' (($all -join ',') -eq ($db -join ',')) "$($all -join ',') vs $($db -join ',')"
    $refused = @(@('/logs', '/trace', '/usage', '/api/trace/people?from=2026-10-01&to=2026-10-02') | Where-Object { [int](Invoke-WebRequest -Uri "$BaseUrl$_" @c).StatusCode -ne 200 })
    Assert-That 'Log Explorer, Trace and Usage answer you' ($refused.Count -eq 0) ($refused -join ', ')
    $w = (Invoke-WebRequest "$BaseUrl/api/moveit/writes" @c).Content | ConvertFrom-Json
    Assert-That 'writes: all, for every feature' ($w.'curate.releases' -eq 'all' -and $w.'curate.events' -eq 'all')
}

Write-Host ''
Write-Host "$script:passed passed, $script:failed failed"
if ($script:failed -gt 0) { exit 1 }
