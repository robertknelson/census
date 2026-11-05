<#
.SYNOPSIS
    Pins the membership page's writes (personas.md §6.2) against a running Census.Web.
.DESCRIPTION
    Creates an application and a member, edits both, grants and revokes a role, and checks what is
    refused (a taken identifier, settings that are not JSON, a grant held twice, a revoke of nothing),
    that every write leaves its audit row, and that the persona lookup sees a grant the moment it is
    made. The rows it makes are demo-marked (Tags 'demo', Identifier 'demo-%'), so the membership
    seed it runs at the end removes them. Never point it at the real server.

      cd Census.Web; dotnet run --launch-profile http
#>
param(
    [string]$BaseUrl = 'http://localhost:5292',
    [string]$Server = 'localhost',
    [string]$Database = 'AppTrak'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

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
    param([string]$Path, $Body)
    # PowerShell 7: a 4xx is an answer here, not an exception.
    $r = Invoke-WebRequest -Uri "$BaseUrl$Path" -Method Post -Headers $headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json) -SkipHttpErrorCheck
    return @{ Status = [int]$r.StatusCode; Body = ($r.Content | ConvertFrom-Json) }
}
# Invoke-RestMethod hands an array back as one object (PowerShell 7); enumerate it so Where-Object sees rows.
function Get-Api { param([string]$Path) (Invoke-RestMethod -Uri "$BaseUrl$Path" -Headers $headers) | ForEach-Object { $_ } }
function Seed { & sqlcmd -S $Server -d $Database -E -b -I -i (Join-Path $repo 'apptrak\seed\seed-membership-demo.sql'); if ($LASTEXITCODE) { throw 'membership seed failed' } }

Seed
$lists = Get-Api '/api/membership/lists'
$website = ($lists | Where-Object { $_.List -eq 'application-types' -and $_.Identifier -eq 'website' }).Id
$tech = ($lists | Where-Object { $_.List -eq 'member-types' -and $_.Identifier -eq 'technical-lead' }).Id

Write-Host 'Applications'
$app = Post '/api/membership/applications' @{ identifier = 'demo-test-app'; name = 'Test App'; tags = 'demo'; disposition = 'current'; applicationTypeId = $website; settings = '' }
Assert-That 'create an application: 200 and its new id' ($app.Status -eq 200 -and [int]$app.Body.key -gt 0) "$($app.Status)"
$appId = [int]$app.Body.key
$dup = Post '/api/membership/applications' @{ identifier = 'demo-test-app'; name = 'Twin'; tags = 'demo'; disposition = 'current'; applicationTypeId = $website }
Assert-That '  a second with the same identifier: 409, said plainly' ($dup.Status -eq 409 -and $dup.Body.errors[0] -like '*identifier*') "$($dup.Status) $($dup.Body.errors)"
$bad = Post "/api/membership/applications/$appId" @{ identifier = 'demo-test-app'; name = 'Test App'; tags = 'demo'; disposition = 'current'; applicationTypeId = $website; settings = '{not json' }
Assert-That '  settings that are not JSON: 400' ($bad.Status -eq 400 -and ($bad.Body.errors -join ' ') -like '*JSON*') "$($bad.Status)"
$empty = Post '/api/membership/applications' @{ identifier = ''; name = ''; disposition = ''; applicationTypeId = 0 }
Assert-That '  nothing filled in: 400 with every reason at once' ($empty.Status -eq 400 -and $empty.Body.errors.Count -ge 4) "$($empty.Status) $($empty.Body.errors.Count)"
$upd = Post "/api/membership/applications/$appId" @{ identifier = 'demo-test-app'; name = 'Test App Renamed'; tags = 'demo'; disposition = 'retired'; applicationTypeId = $website; settings = '{ "settings": { "owner": "x" } }' }
$row = Get-Api '/api/membership/applications' | Where-Object { $_.ApplicationId -eq $appId }
Assert-That '  an edit lands: name, disposition, settings' ($upd.Status -eq 200 -and $row.Name -eq 'Test App Renamed' -and $row.Disposition -eq 'retired' -and $row.Settings -like '*owner*') "$($row.Name) $($row.Disposition)"
$missing = Post '/api/membership/applications/999999' @{ identifier = 'demo-nope'; name = 'Nope'; disposition = 'current'; applicationTypeId = $website }
Assert-That '  editing one that does not exist: 404' ($missing.Status -eq 404) $missing.Status

Write-Host 'Members'
$mem = Post '/api/membership/members' @{ identifier = 'demo-test-member'; windowsIdentity = 'DEMO\tester'; firstName = 'Tess'; lastName = 'Tester'; email = '' }
Assert-That 'create a member: 200 and its new id' ($mem.Status -eq 200 -and [int]$mem.Body.key -gt 0) "$($mem.Status)"
$memId = [int]$mem.Body.key
$twin = Post '/api/membership/members' @{ identifier = 'demo-test-twin'; windowsIdentity = 'DEMO\tester'; firstName = 'T'; lastName = 'Twin' }
Assert-That '  a second with the same Windows identity: 409' ($twin.Status -eq 409 -and $twin.Body.errors[0] -like '*Windows identity*') "$($twin.Status)"
$medit = Post "/api/membership/members/$memId" @{ identifier = 'demo-test-member'; windowsIdentity = 'DEMO\tester'; firstName = 'Tessa'; lastName = 'Tester'; email = 'tessa@example.com' }
Assert-That '  an edit lands' ($medit.Status -eq 200) $medit.Status

Write-Host 'Grants'
$g = Post '/api/membership/grants/grant' @{ memberId = $memId; applicationId = $appId; roleId = $tech }
Assert-That 'grant technical-lead on the test application' ($g.Status -eq 200 -and $g.Body.key -eq "${memId}:${appId}:${tech}") "$($g.Status) $($g.Body.key)"
$access = Get-Api '/api/personas/members/demo-test-member'
Assert-That '  the persona lookup sees it at once' (@($access.applications | Where-Object { $_.applicationId -eq $appId -and $_.roles -contains 'technical-lead' }).Count -eq 1) ($access.applications | ConvertTo-Json -Compress)
$g2 = Post '/api/membership/grants/grant' @{ memberId = $memId; applicationId = $appId; roleId = $tech }
Assert-That '  granting it again: 409, not a silent no-op' ($g2.Status -eq 409) $g2.Status
$nope = Post '/api/membership/grants/grant' @{ memberId = $memId; applicationId = $appId; roleId = 1 }
Assert-That '  a role not in member-types: 404' ($nope.Status -eq 404) $nope.Status
$r = Post '/api/membership/grants/revoke' @{ memberId = $memId; applicationId = $appId; roleId = $tech }
$access = Get-Api '/api/personas/members/demo-test-member'
Assert-That 'revoke it: gone from the persona lookup' ($r.Status -eq 200 -and @($access.applications).Count -eq 0) "$($r.Status) $(@($access.applications).Count)"
$r2 = Post '/api/membership/grants/revoke' @{ memberId = $memId; applicationId = $appId; roleId = $tech }
Assert-That '  revoking what is not held: 409' ($r2.Status -eq 409) $r2.Status

Write-Host 'History'
$ah = Get-Api "/api/membership/audit/application/$appId"
Assert-That 'the application: created, updated, granted, revoked — newest first, by demo-sam' (
    (($ah | ForEach-Object Action) -join ',') -eq 'revoked,granted,updated,created' -and @($ah | Where-Object ChangedBy -ne 'demo-sam').Count -eq 0) (($ah | ForEach-Object Action) -join ',')
$mh = Get-Api "/api/membership/audit/member/$memId"
Assert-That 'the member: created, updated, and the same two grants' ((($mh | ForEach-Object Action) -join ',') -eq 'revoked,granted,updated,created') (($mh | ForEach-Object Action) -join ',')
$upd1 = $ah | Where-Object Action -eq 'updated' | Select-Object -First 1
Assert-That '  an update keeps both sides' (($upd1.PreviousValue | ConvertFrom-Json).Name -eq 'Test App' -and ($upd1.NewValue | ConvertFrom-Json).Name -eq 'Test App Renamed') $upd1.PreviousValue
$recent = Get-Api '/api/membership/audit/recent'
Assert-That 'recent changes lead with the last revoke' ($recent[0].Action -eq 'revoked') $recent[0].Action

Write-Host 'Parts of an application'
$lists = Get-Api '/api/membership/lists'
$val = ($lists | Where-Object { $_.List -eq 'stages' -and $_.Identifier -eq 'VAL' }).Id
$health = ($lists | Where-Object { $_.List -eq 'service-types' -and $_.Identifier -eq 'health-check' }).Id
$p1 = Post '/api/membership/parts/save' @{ part = 'role'; applicationId = $appId; roleId = $tech; alias = 'Lead' }
Assert-That 'add a role the application uses, with its alias' ($p1.Status -eq 200 -and $p1.Body.key -eq "${appId}:${tech}") "$($p1.Status) $($p1.Body.errors)"
Assert-That '  the same role twice: 409' ((Post '/api/membership/parts/save' @{ part = 'role'; applicationId = $appId; roleId = $tech }).Status -eq 409)
$p2 = Post '/api/membership/parts/save' @{ part = 'stage'; applicationId = $appId; stageId = $val; name = 'Val' }
Assert-That 'add a stage with its own name' ($p2.Status -eq 200)
Assert-That '  a name longer than the column (10): 400' ((Post '/api/membership/parts/save' @{ part = 'stage'; applicationId = $appId; stageId = $val; name = 'Validation stage'; oldKey = $val }).Status -eq 400)
$p3 = Post '/api/membership/parts/save' @{ part = 'service'; applicationId = $appId; serviceTypeId = $health; startOn = '2026-10-01'; status = 'live' }
Assert-That 'add a service, since a date, with a status' ($p3.Status -eq 200)
$svcId = [int]($p3.Body.key -split ':')[1]
$p3b = Post '/api/membership/parts/save' @{ part = 'service'; applicationId = $appId; serviceTypeId = $health; startOn = '2026-10-02'; status = 'paused'; oldKey = $svcId }
$parts = Get-Api '/api/membership/app-parts' | Where-Object { $_.ApplicationId -eq $appId }
Assert-That '  correct it' ($p3b.Status -eq 200 -and ($parts | Where-Object { $_.Part -eq 'service' }).Status -eq 'paused') (($parts | Where-Object { $_.Part -eq 'service' }).Status)
$rm = Post '/api/membership/parts/delete' @{ part = 'stage'; applicationId = $appId; oldKey = $val }
Assert-That 'remove the stage; removing it again: 404' ($rm.Status -eq 200 -and (Post '/api/membership/parts/delete' @{ part = 'stage'; applicationId = $appId; oldKey = $val }).Status -eq 404)

Write-Host 'Deletes'
$inUse = Post '/api/membership/applications/1/delete'
Assert-That 'deleting an application Move It still names: 409, saying what names it' ($inUse.Status -eq 409 -and $inUse.Body.errors[0] -like '*release*') "$($inUse.Status) $($inUse.Body.errors)"
$m2 = Post '/api/membership/members' @{ identifier = 'demo-test-gone'; windowsIdentity = 'DEMO\gone'; firstName = 'Gone'; lastName = 'Soon' }
$m2Id = [int]$m2.Body.key
$null = Post '/api/membership/grants/grant' @{ memberId = $m2Id; applicationId = $appId; roleId = $tech }
$dm = Post "/api/membership/members/$m2Id/delete"
$grantsLeft = Get-Api '/api/membership/members' | Where-Object { $_.MemberId -eq $m2Id }
Assert-That 'delete a member: gone, with their grant' ($dm.Status -eq 200 -and @($grantsLeft).Count -eq 0) "$($dm.Status) $(@($grantsLeft).Count)"
$mh2 = Get-Api "/api/membership/audit/member/$m2Id"
Assert-That '  the history keeps the member and the grant it held' (($mh2 | Where-Object Action -eq 'deleted') -and (($mh2 | Where-Object Action -eq 'deleted').PreviousValue | ConvertFrom-Json).Grants.Count -eq 1)

$da = Post "/api/membership/applications/$appId/delete"
$left = Get-Api '/api/membership/applications' | Where-Object { $_.ApplicationId -eq $appId }
$appParts = Get-Api '/api/membership/app-parts' | Where-Object { $_.ApplicationId -eq $appId }
Assert-That 'delete the test application: gone, its roles and service with it' ($da.Status -eq 200 -and @($left).Count -eq 0 -and @($appParts).Count -eq 0) "$($da.Status)"
$ah2 = Get-Api "/api/membership/audit/application/$appId"
Assert-That '  its history keeps it, and what hung off it' ((($ah2 | Where-Object { $_.Entity -eq 'application' -and $_.Action -eq 'deleted' }).PreviousValue | ConvertFrom-Json).Services.Count -eq 1)

Seed
$left = Get-Api '/api/membership/applications' | Where-Object { $_.Identifier -like 'demo-test*' }
Assert-That 'the membership seed removes what the test made' (@($left).Count -eq 0) @($left).Count

Write-Host 'Role drift (census-on-apptrak.md section 4)'
Assert-That 'no drift in the demo: an empty report' (@(Get-Api '/api/membership/role-drift').Count -eq 0)
& sqlcmd -S $Server -d $Database -E -b -I -Q "INSERT fm.FeatureRole (FeatureId, RoleName, GrantedBy) SELECT FeatureId, 'ghost-role', 'test' FROM fm.Feature WHERE Name = 'view.week' AND IsVoided = 0" | Out-Null
try {
    $drift = @(Get-Api '/api/membership/role-drift')
    Assert-That 'a feature granted to a role not on the list is reported' ($drift.Count -eq 1 -and $drift[0].Place -eq 'feature' -and $drift[0].Role -eq 'ghost-role' -and $drift[0].Problem -eq 'not on the list' -and $drift[0].Detail -eq 'view.week') ($drift | ConvertTo-Json -Compress)
}
finally { & sqlcmd -S $Server -d $Database -E -b -I -Q "DELETE FROM fm.FeatureRole WHERE RoleName = 'ghost-role'" | Out-Null }
Assert-That '  and gone once the grant is' (@(Get-Api '/api/membership/role-drift').Count -eq 0)

Write-Host ''
Write-Host "$($script:passed) passed, $($script:failed) failed" -ForegroundColor ($(if ($script:failed) { 'Red' } else { 'Green' }))
Invoke-WebRequest -Uri "$BaseUrl/api/impersonation/stop" -Method Post -ContentType 'application/json' -Body '{}' | Out-Null
if ($script:failed) { exit 1 }
