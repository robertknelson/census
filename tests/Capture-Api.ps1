<#
.SYNOPSIS
    Saves what every SQL-backed read answers, one file per endpoint, so two runs can be compared byte for byte.
.DESCRIPTION
    Written for the move onto command/query (census-on-apptrak.md §3, C-1): run it before a change and after, then
    compare the two folders. Signed in as you (Windows); impersonation must be off. Read-only.

      .\tests\Capture-Api.ps1 -Out C:\temp\before
      .\tests\Capture-Api.ps1 -Out C:\temp\after
      Compare-Object (Get-ChildItem C:\temp\before) ... or: git diff --no-index C:\temp\before C:\temp\after
#>
param(
    [Parameter(Mandatory)] [string]$Out,
    [string]$BaseUrl = 'http://localhost:5292',
    [string]$From = '2026-09-23',
    [string]$To = '2026-10-23'
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
$c = @{ UseDefaultCredentials = $true; AllowUnencryptedAuthentication = $true; SkipHttpErrorCheck = $true }

function Save([string]$Name, [string]$Path) {
    $r = Invoke-WebRequest -Uri "$BaseUrl$Path" @c
    Set-Content -Path (Join-Path $Out "$Name.txt") -Value "$([int]$r.StatusCode)`n$($r.Content)" -NoNewline
    return $r
}

$moveit = 'stages', 'applications', 'releases', 'history', 'events', 'release-builds', 'release-build-history', 'builds-seen',
    'coverage', 'calendar', 'lists', 'where-is-everything', 'release-status', 'ready-to-approve', 'approval-vs-prod', 'feature-picture'
foreach ($m in $moveit) { Save "moveit-$m" "/api/moveit/$m" | Out-Null }

foreach ($e in 'releases', 'workitems', 'builds', 'events', 'links', 'audit-recent') { Save "edit-$e" "/api/edit/$e" | Out-Null }
$releases = (Invoke-RestMethod "$BaseUrl/api/edit/releases" -UseDefaultCredentials -AllowUnencryptedAuthentication) | ForEach-Object { $_ }
foreach ($r in $releases | Select-Object -First 3) { Save "edit-audit-release-$($r.ReleaseId)" "/api/edit/audit/release/$($r.ReleaseId)" | Out-Null }

foreach ($m in 'applications', 'members', 'lists', 'app-parts', 'audit/recent') { Save "membership-$($m -replace '/', '-')" "/api/membership/$m" | Out-Null }
Save 'membership-audit-application-1' '/api/membership/audit/application/1' | Out-Null
Save 'membership-audit-member-1' '/api/membership/audit/member/1' | Out-Null

foreach ($p in 'me', 'lead-time', 'order-violations', 'stage-mismatch', 'members', 'members/demo-paula', 'members/demo-sam') { Save "personas-$($p -replace '/', '-')" "/api/personas/$p" | Out-Null }
Save 'reset-status' '/api/admin/reset' | Out-Null
Save 'feature-access-roles' '/api/feature-access/roles' | Out-Null

foreach ($model in 'api-request', 'exception-event', 'message') {
    Save "logs-$model-facets" "/api/logs/$model/facets?start=$From&end=$To&profile-fields=Application,Host" | Out-Null
    Save "logs-$model-search" "/api/logs/$model/search?log-start=$From&log-end=$To&pageSize=50" | Out-Null
}
$people = (Save 'trace-people' "/api/trace/people?from=$From&to=$To").Content | ConvertFrom-Json
$person = @($people | ForEach-Object { $_ })[0]
$id = if ($person.identifier) { $person.identifier } else { $person.Identifier }
Save 'trace-month' "/api/trace/month?person=$id&from=$From&to=$To" | Out-Null
Save 'trace-day' "/api/trace/day?person=$id&from=2026-10-01&to=2026-10-02" | Out-Null
$session = (sqlcmd -S localhost -E -h -1 -W -d CensusLogsDemo -Q "SET NOCOUNT ON; SELECT TOP 1 SessionId FROM apptrak.ApiRequest WHERE SessionId IS NOT NULL ORDER BY StartAt DESC").Trim()
Save 'trace-session' "/api/trace/session?id=$session" | Out-Null

$apps = (Save 'usage-applications' "/api/usage/applications?from=$From&to=$To").Content | ConvertFrom-Json
Save 'usage-summary' "/api/usage/summary?from=$From&to=$To" | Out-Null
$app = @($apps | ForEach-Object { $_ })[0]
$name = $app.application
foreach ($s in 'overview', 'pages', 'people', 'when', 'paths', 'friction') { Save "usage-$s" "/api/usage/$s`?application=$([uri]::EscapeDataString($name))&stage=PROD&from=$From&to=$To" | Out-Null }

Write-Host "$((Get-ChildItem $Out).Count) answers saved to $Out"
