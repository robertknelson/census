<#
.SYNOPSIS
    Pins the curate pages' corrections (personas.md §6.3) against a running Census.Web.
.DESCRIPTION
    Robert, 2026-10-22: "i need to be able to correct anything". For every asserted Move It row —
    release, feature or fix, build claim, event, link — this creates one, corrects it, checks what
    is refused, deletes it, and checks the history; and it checks that Move It's own questions see
    a corrected event. Everything it makes is written as demo-sam, so the demo seed removes it; it
    also deletes what it made. Never point it at the real server.

      cd Census.Web; dotnet run --launch-profile http
#>
param(
    [string]$BaseUrl = 'http://localhost:5292'
)
$ErrorActionPreference = 'Stop'

$script:passed = 0
$script:failed = 0
function Assert-That {
    param([string]$Name, [bool]$Condition, $Actual = '')
    if ($Condition) { $script:passed++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else            { $script:failed++; Write-Host "  FAIL  $Name  [actual: $Actual]" -ForegroundColor Red }
}
# Signed in as you (Windows, census-on-apptrak.md §10), acting as demo-sam through impersonation, so what this writes
# is demo-sam's as before. You must be a system administrator here (appsettings.Local.json).
$headers = @{}
foreach ($c in 'Invoke-WebRequest', 'Invoke-RestMethod') {
    $PSDefaultParameterValues["$($c):UseDefaultCredentials"] = $true
    $PSDefaultParameterValues["$($c):AllowUnencryptedAuthentication"] = $true
}
Invoke-WebRequest -Uri "$BaseUrl/api/impersonation" -Method Post -ContentType 'application/json' -Body '{"identifier":"demo-sam"}' | Out-Null
function Post {
    param([string]$Path, $Body = @{})
    $r = Invoke-WebRequest -Uri "$BaseUrl$Path" -Method Post -Headers $headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json) -SkipHttpErrorCheck
    return @{ Status = [int]$r.StatusCode; Body = ($r.Content | ConvertFrom-Json) }
}
# Invoke-RestMethod hands an array back as one object (PowerShell 7); enumerate it so Where-Object sees rows.
function Get-Api { param([string]$Path) (Invoke-RestMethod -Uri "$BaseUrl$Path" -Headers $headers) | ForEach-Object { $_ } }

Write-Host 'Release'
$rel = Post '/api/edit/release' @{ applicationId = 1; name = 'Test release'; kind = 'featureset'; targetDate = '2026-11-30'; note = 'from the test' }
Assert-That 'create a release' ($rel.Status -eq 200) "$($rel.Status) $($rel.Body.errors)"
$relId = [int]$rel.Body.key
Assert-That '  the same name in the same application: 409' ((Post '/api/edit/release' @{ applicationId = 1; name = 'Test release'; kind = 'featureset' }).Status -eq 409)
$badKind = Post '/api/edit/release' @{ applicationId = 1; name = 'Odd'; kind = 'sprint'; targetDate = 'soon' }
Assert-That '  a kind not in release-kinds and a date that is not one: 400, both said' ($badKind.Status -eq 400 -and $badKind.Body.errors.Count -eq 2) ($badKind.Body.errors -join ' | ')
$upd = Post "/api/edit/release/$relId" @{ applicationId = 1; name = 'Test release, renamed'; kind = 'hotfix'; targetDate = '2026-12-15'; note = $null }
$row = Get-Api '/api/edit/releases' | Where-Object { $_.ReleaseId -eq $relId }
Assert-That '  correct its name, kind, target date and note' ($upd.Status -eq 200 -and $row.Name -eq 'Test release, renamed' -and $row.Kind -eq 'hotfix' -and ([datetime]$row.TargetDate).ToString('yyyy-MM-dd') -eq '2026-12-15' -and $null -eq $row.Note) "$($row.Name) $($row.Kind) $($row.TargetDate)"

Write-Host 'Features and fixes'
$item = Post '/api/edit/workitem' @{ applicationId = 1; releaseId = $relId; kind = 'feature'; title = 'Test item'; description = 'd'; builtBy = 'dev-t'; externalRef = 'T-9'; includedInBuild = 'T-1'; foundInStage = $null }
Assert-That 'create an item in the release' ($item.Status -eq 200) "$($item.Status) $($item.Body.errors)"
$itemId = [int]$item.Body.key
$heard = Post '/api/edit/workitem' @{ applicationId = 1; kind = 'fix'; title = 'Heard, no release' }
$heardId = [int]$heard.Body.key
Assert-That 'create an item with no release (the notebook)' ($heard.Status -eq 200)
Assert-That '  a release of another application: 409' ((Post '/api/edit/workitem' @{ applicationId = 5; releaseId = $relId; kind = 'fix'; title = 'Wrong app' }).Status -eq 409)
Assert-That '  a stage not in stages: 400' ((Post '/api/edit/workitem' @{ applicationId = 1; kind = 'fix'; title = 'x'; foundInStage = 'QA' }).Status -eq 400)
$fix = Post "/api/edit/workitem/$itemId" @{ applicationId = 1; releaseId = $relId; kind = 'fix'; title = 'Test item'; description = $null; builtBy = 'dev-u'; externalRef = 'T-10'; includedInBuild = 'T-1'; foundInStage = 'VAL'; removedAt = '2026-10-20T12:00:00Z'; removedNote = 'pulled for the test' }
$w = Get-Api '/api/edit/workitems' | Where-Object { $_.WorkItemId -eq $itemId }
Assert-That '  correct every column: kind, built by, ref, stage, removed' ($fix.Status -eq 200 -and $w.Kind -eq 'fix' -and $w.BuiltBy -eq 'dev-u' -and $w.FoundInStage -eq 'VAL' -and $w.RemovedNote -eq 'pulled for the test') "$($w.Kind) $($w.FoundInStage)"
$restore = Post "/api/edit/workitem/$itemId" @{ applicationId = 1; releaseId = $relId; kind = 'fix'; title = 'Test item'; includedInBuild = 'T-1'; removedAt = $null; removedNote = $null }
$w = Get-Api '/api/edit/workitems' | Where-Object { $_.WorkItemId -eq $itemId }
Assert-That '  and put it back (un-pull)' ($restore.Status -eq 200 -and $null -eq $w.RemovedAt) $w.RemovedAt

Write-Host 'Links'
$link = Post '/api/edit/link' @{ workItemId = $itemId; linkedWorkItemId = $heardId; kind = 'depends-on'; note = 'n' }
Assert-That 'link the two items' ($link.Status -eq 200) "$($link.Status) $($link.Body.errors)"
$linkId = [int]$link.Body.key
Assert-That '  the same link twice: 409' ((Post '/api/edit/link' @{ workItemId = $itemId; linkedWorkItemId = $heardId; kind = 'depends-on' }).Status -eq 409)
Assert-That '  an item to itself: 409' ((Post '/api/edit/link' @{ workItemId = $itemId; linkedWorkItemId = $itemId; kind = 'related-to' }).Status -eq 409)
Assert-That '  correct its kind' ((Post "/api/edit/link/$linkId" @{ workItemId = $itemId; linkedWorkItemId = $heardId; kind = 'related-to'; note = 'n2' }).Status -eq 200)

Write-Host 'Build claims'
$b = Post '/api/edit/build' @{ releaseId = $relId; build = 'T-1'; note = 'claimed by the test' }
Assert-That 'claim a build' ($b.Status -eq 200)
$bId = [int]$b.Body.key
Assert-That '  the same build twice: 409' ((Post '/api/edit/build' @{ releaseId = $relId; build = 'T-1' }).Status -eq 409)
Assert-That '  correct its note' ((Post "/api/edit/build/$bId" @{ releaseId = $relId; build = 'T-1'; note = 'corrected' }).Status -eq 200)

Write-Host 'Events'
$e = Post '/api/edit/event' @{ releaseId = $relId; kind = 'approved'; stage = 'VAL'; build = 'T-1'; at = '2026-10-21T15:00:00Z'; by = 'robert'; note = $null }
Assert-That 'record an approval' ($e.Status -eq 200)
$eId = [int]$e.Body.key
$status = Get-Api '/api/moveit/release-status' | Where-Object { $_.ReleaseId -eq $relId }
Assert-That '  Move It sees it' ($null -ne $status.ApprovedAt) $status.ApprovedAt
$ce = Post "/api/edit/event/$eId" @{ releaseId = $relId; kind = 'approved'; stage = 'PROD'; build = 'T-1'; at = '2026-10-22T09:30:00Z'; by = 'robert'; note = 'the date was wrong' }
$status = Get-Api '/api/moveit/release-status' | Where-Object { $_.ReleaseId -eq $relId }
Assert-That '  correct it in place: Move It sees the corrected time' ($ce.Status -eq 200 -and ([DateTimeOffset]$status.ApprovedAt).UtcDateTime.ToString('yyyy-MM-ddTHH:mm') -eq '2026-10-22T09:30') $status.ApprovedAt
Assert-That '  a kind not in event-kinds, no when, no who: 400, all three' ((Post '/api/edit/event' @{ releaseId = $relId; kind = 'blessed' }).Body.errors.Count -eq 3)
$de = Post "/api/edit/event/$eId/delete"
$status = Get-Api '/api/moveit/release-status' | Where-Object { $_.ReleaseId -eq $relId }
Assert-That '  delete it: Move It no longer counts it' ($de.Status -eq 200 -and $null -eq $status.ApprovedAt) $status.ApprovedAt
Assert-That '  delete it again: 404' ((Post "/api/edit/event/$eId/delete").Status -eq 404)

Write-Host 'Moving and deleting'
$mv = Post "/api/edit/release/$relId" @{ applicationId = 5; name = 'Test release, renamed'; kind = 'hotfix'; targetDate = '2026-12-15' }
$w = Get-Api '/api/edit/workitems' | Where-Object { $_.WorkItemId -eq $itemId }
Assert-That 'move the release to another application: its items follow' ($mv.Status -eq 200 -and $w.ApplicationId -eq 5) $w.ApplicationId
$dr = Post "/api/edit/release/$relId/delete"
$items = Get-Api '/api/edit/workitems'
Assert-That 'delete the release: its item, claim and link go; the notebook item stays' (
    $dr.Status -eq 200 -and @($items | Where-Object WorkItemId -eq $itemId).Count -eq 0 -and @($items | Where-Object WorkItemId -eq $heardId).Count -eq 1 -and
    @(Get-Api '/api/edit/links' | Where-Object LinkId -eq $linkId).Count -eq 0 -and @(Get-Api '/api/edit/builds' | Where-Object ReleaseBuildId -eq $bId).Count -eq 0) $dr.Status
$history = Get-Api "/api/edit/audit/release/$relId"
$deleted = $history | Where-Object { $_.Entity -eq 'release' -and $_.Action -eq 'deleted' }
Assert-That '  the release''s history keeps everything, the delete holding the whole release with its items' (
    $deleted -and ($deleted.PreviousValue | ConvertFrom-Json).WorkItems.Count -eq 1 -and @($history | Where-Object Entity -eq 'event').Count -eq 3) "$(@($history).Count) rows"
Assert-That '  every change is demo-sam''s' (@($history | Where-Object ChangedBy -ne 'demo-sam').Count -eq 0)
Assert-That 'delete the notebook item' ((Post "/api/edit/workitem/$heardId/delete").Status -eq 200)
Assert-That 'an unknown kind of thing to delete: 404' ((Post "/api/edit/deployment/1/delete").Status -eq 404)

$recent = Get-Api '/api/edit/audit-recent'
Assert-That 'recent corrections lead with the last delete' ($recent[0].Entity -eq 'workitem' -and $recent[0].Action -eq 'deleted') "$($recent[0].Entity) $($recent[0].Action)"

Write-Host ''
Write-Host "$($script:passed) passed, $($script:failed) failed" -ForegroundColor ($(if ($script:failed) { 'Red' } else { 'Green' }))
Invoke-WebRequest -Uri "$BaseUrl/api/impersonation/stop" -Method Post -ContentType 'application/json' -Body '{}' | Out-Null
if ($script:failed) { exit 1 }
