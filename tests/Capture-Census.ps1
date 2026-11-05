<#
.SYNOPSIS
    Saves what Census's own reads answer (the estate, graphs, findings, the config documents), one file per endpoint,
    so two runs can be compared byte for byte.
.DESCRIPTION
    Written for moving Census's config documents into AppTrak (census-on-apptrak.md §6, T-slices): run it with a
    document in its file, then with it in the database after an Import, and compare the folders. Read-only. Signed in
    as you (Windows). Best run against the demo fleet (the app started with the demo profile's Census paths).

      .\tests\Capture-Census.ps1 -Out C:\temp\files
#>
param(
    [Parameter(Mandatory)] [string]$Out,
    [string]$BaseUrl = 'http://localhost:5292',
    [string]$Machine = 'WEB01',
    [string]$System = 'MyWeb'
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
$c = @{ UseDefaultCredentials = $true; AllowUnencryptedAuthentication = $true; SkipHttpErrorCheck = $true }

function Save([string]$Name, [string]$Path) {
    $r = Invoke-WebRequest -Uri "$BaseUrl$Path" @c
    Set-Content -Path (Join-Path $Out "$Name.txt") -Value "$([int]$r.StatusCode)`n$($r.Content)" -NoNewline
}

$paths = [ordered]@{
    'entity-tags' = '/api/entity-tags'; 'entity-tags-triage' = '/api/entity-tags/triage'; 'entity-tags-machine' = "/api/entity-tags/machine/$Machine"
    'systems' = '/api/systems'; 'systems-overview' = '/api/systems/overview'
    'stage-crossings' = '/api/stage-crossings'; 'declared-entities' = '/api/declared-entities'; 'assets' = '/api/assets'
    'baselines' = '/api/baselines'; 'baselines-config' = '/api/baselines/config'; 'baselines-machine' = "/api/baselines/machines/$Machine"
    'blacklist' = '/api/blacklist'; 'views' = '/api/views'
    'canvas' = '/api/canvas'; 'canvas-dates' = '/api/canvas/dates'; 'system-graph' = "/api/system-graph/$System"
    'findings' = '/api/findings'; 'compliance' = '/api/compliance'; 'compliance-summary' = '/api/compliance/summary'
    'coverage' = '/api/coverage'; 'machines' = '/api/machines'; 'hosting' = '/api/hosting'; 'software' = '/api/software'
    'certificates' = '/api/certificates'; 'changes' = '/api/changes'; 'day' = '/api/day'; 'day-month' = '/api/day/month'
    'blast-radius' = "/api/blast-radius/$Machine"; 'export-compliance' = '/api/export/compliance.csv'
}
foreach ($k in $paths.Keys) { Save $k $paths[$k] }
Write-Host "$($paths.Count) answers saved to $Out"
