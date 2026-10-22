<#
.SYNOPSIS
    Pins each seeded member's features and application scope (personas.md slice P-1).
.DESCRIPTION
    The membership fixtures (apptrak/seed/seed-membership-demo.sql) carry one member per
    persona and a mixed one; this asserts what the persona API answers for each, by the rule
    it proves (personas.md 4 and 6): a role on Census is estate-wide; a role elsewhere scopes;
    each application gets the estate roles' features plus its own; a member with nothing
    sees nothing.

    Reseeds the membership fixtures first (-SkipReseed reuses what is there), then reads a
    running Census.Web on the Development profile:
      cd Census.Web; dotnet run --launch-profile http
#>
param(
    [string]$BaseUrl = 'http://localhost:5292',
    [string]$Server = 'localhost',
    [string]$Database = 'AppTrak',
    [switch]$SkipReseed
)
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
if (-not $SkipReseed) {
    & sqlcmd -S $Server -d $Database -E -b -I -i (Join-Path $repo 'apptrak\seed\seed-membership-demo.sql')
    if ($LASTEXITCODE -ne 0) { throw "membership seed failed (exit $LASTEXITCODE)" }
}

$script:passed = 0
$script:failed = 0
function Assert-That {
    param([string]$Name, [bool]$Condition, $Actual = '')
    if ($Condition) { $script:passed++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else            { $script:failed++; Write-Host "  FAIL  $Name  [actual: $Actual]" -ForegroundColor Red }
}
function Get-Api { param([string]$Path) Invoke-RestMethod -Uri "$BaseUrl$Path" -Method Get }
function Same { param($A, $B) (@($A | Sort-Object) -join ',') -eq (@($B | Sort-Object) -join ',') }
function App { param($Access, [string]$Name) $Access.applications | Where-Object name -eq $Name | Select-Object -First 1 }

$grain  = 'view.quarter', 'view.month', 'view.week'
$read   = @('view.year') + $grain
$drill  = 'drill.deployments', 'drill.builds'
$curate = 'curate.queue', 'curate.associations', 'curate.releases', 'curate.feature-sets', 'curate.events'
$pages  = 'surface.atlas', 'surface.estate', 'surface.day'
$moveit = @('surface.moveit')
$fleet  = 'WidgetCore', 'My WebApp', 'Your WebApp', 'MortgageGateway', 'Reporting'

Write-Host 'The member list'
$members = Get-Api '/api/personas/members'
Assert-That 'eight demo members' (@($members | Where-Object { $_.identifier -like 'demo-*' }).Count -eq 8) @($members).Count

Write-Host 'Estate-wide: a role held on Census'
$sam = Get-Api '/api/personas/members/demo-sam'
Assert-That 'Sys Admin is estate-wide' ($sam.estate -and (Same $sam.estateRoles @('system-administrator'))) "$($sam.estate) $($sam.estateRoles)"
Assert-That '  every feature' (Same $sam.features ($read + $drill + $curate + $moveit + $pages)) ($sam.features -join ',')
Assert-That '  every application, Census itself not among them' (Same $sam.applications.name $fleet) ($sam.applications.name -join ',')
$ellen = Get-Api '/api/personas/members/demo-ellen'
Assert-That 'Executive is estate-wide, every application' ($ellen.estate -and (Same $ellen.applications.name $fleet)) ($ellen.applications.name -join ',')
Assert-That '  reads at every grain, drills nothing, curates nothing; Move It, not the machine pages' (Same $ellen.features ($read + $moveit)) ($ellen.features -join ',')

Write-Host 'Scoped: roles held on applications'
$paula = Get-Api '/api/personas/members/demo-paula'
Assert-That 'Product Owner sees their two applications only' (-not $paula.estate -and (Same $paula.applications.name @('WidgetCore', 'Reporting'))) ($paula.applications.name -join ',')
Assert-That '  the Executive views, trimmed' (Same $paula.features ($read + $moveit)) ($paula.features -join ',')
$terry = Get-Api '/api/personas/members/demo-terry'
Assert-That 'Tech Lead sees their two applications' (Same $terry.applications.name @('WidgetCore', 'My WebApp')) ($terry.applications.name -join ',')
Assert-That '  quarter down, drill-down, no year, no curation; every existing page' (Same $terry.features ($grain + $drill + $moveit + $pages)) ($terry.features -join ',')
$ada = Get-Api '/api/personas/members/demo-ada'
Assert-That 'Application Administrator curates their one application' ((Same $ada.applications.name @('Your WebApp')) -and (Same (App $ada 'Your WebApp').features ($grain + $drill + $curate + $moveit + $pages))) ((App $ada 'Your WebApp').features -join ',')

Write-Host 'Mixed: each application at its own depth'
$max = Get-Api '/api/personas/members/demo-max'
Assert-That 'Max sees MortgageGateway and Reporting' (Same $max.applications.name @('MortgageGateway', 'Reporting')) ($max.applications.name -join ',')
Assert-That '  MortgageGateway as product owner: read views, no drill' (Same (App $max 'MortgageGateway').features ($read + $moveit)) ((App $max 'MortgageGateway').features -join ',')
Assert-That '  Reporting as tech lead: quarter down and drill, no year' (Same (App $max 'Reporting').features ($grain + $drill + $moveit + $pages)) ((App $max 'Reporting').features -join ',')
Assert-That '  the member-wide set is the union' (Same $max.features ($read + $drill + $moveit + $pages)) ($max.features -join ',')

Write-Host 'Nothing granted'
$otto = Get-Api '/api/personas/members/demo-otto'
Assert-That 'Observer: estate-wide scope, no features yet (later)' ($otto.estate -and @($otto.features).Count -eq 0) ($otto.features -join ',')
$nova = Get-Api '/api/personas/members/demo-nova'
Assert-That 'A member with no roles: no applications, no features' (@($nova.applications).Count -eq 0 -and @($nova.features).Count -eq 0) "$(@($nova.applications).Count)/$(@($nova.features).Count)"
$missing = try { Invoke-WebRequest -Uri "$BaseUrl/api/personas/members/demo-nobody" -UseBasicParsing; 200 } catch { $_.Exception.Response.StatusCode.value__ }
Assert-That 'an unknown member is 404' ($missing -eq 404) $missing

Write-Host ''
Write-Host "$($script:passed) passed, $($script:failed) failed" -ForegroundColor ($(if ($script:failed) { 'Red' } else { 'Green' }))
if ($script:failed) { exit 1 }
