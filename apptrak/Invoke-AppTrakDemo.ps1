<#
    Builds the Move It tables in a local AppTrak database and loads the fabricated fixtures.

    WHY THIS EXISTS. No real AppTrak data can reach this environment (move-it.md 6, hard
    constraint), so the fixtures in seed/ are the coverage. This runs the pieces in the only
    order that works: DDL, lookups, seed, then the backfill that derives moveit.Deployment
    from the seeded HealthReport history using the same rule the live processor will use.

    Everything it runs is idempotent; run it again after changing any file.

    The real environment gets 001, 002, 003 and backfill-deployment.sql. It never
    gets seed/ - and sql/history-deployment-episodes.sql is read-only and only for there.

    Usage: .\Invoke-AppTrakDemo.ps1 [-Server localhost] [-Database AppTrak] [-SkipSeed]
#>
param(
    [string]$Server = 'localhost',
    [string]$Database = 'AppTrak',
    [switch]$SkipSeed
)
$ErrorActionPreference = 'Stop'

$steps = @(
    'sql\001-create-deployment.sql',
    'sql\002-create-moveit-schema.sql',
    'sql\003-lookups.sql',
    'sql\fm\001-fm-schema.sql',
    'sql\fm\002-census-features.sql',
    'sql\membership\001-membership-audit.sql'
)
if (-not $SkipSeed) { $steps += 'seed\seed-apptrak-demo.sql', 'seed\seed-membership-demo.sql' }
$steps += 'sql\backfill-deployment.sql'

foreach ($step in $steps) {
    $path = Join-Path $PSScriptRoot $step
    Write-Host "-- $step"
    # -b: exit non-zero on the first SQL error, so a broken step stops the run.
    # -I: QUOTED_IDENTIFIER ON; HealthReport's indexes refuse writes without it.
    & sqlcmd -S $Server -d $Database -E -b -I -i $path
    if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed on $step (exit $LASTEXITCODE)" }
}

Write-Host '-- row counts'
& sqlcmd -S $Server -d $Database -E -W -s '|' -Q @"
SET NOCOUNT ON;
SELECT 'health.HealthEndpoint' AS [table], COUNT(*) AS [rows] FROM health.HealthEndpoint WHERE Tags = 'demo'
UNION ALL SELECT 'health.HealthReport',  COUNT(*) FROM health.HealthReport WHERE SessionId = 'demo-seed'
UNION ALL SELECT 'moveit.Deployment',    COUNT(*) FROM moveit.Deployment
UNION ALL SELECT 'moveit.Release',       COUNT(*) FROM moveit.Release
UNION ALL SELECT 'moveit.WorkItem',      COUNT(*) FROM moveit.WorkItem
UNION ALL SELECT 'moveit.ReleaseBuild',  COUNT(*) FROM moveit.ReleaseBuild
UNION ALL SELECT 'moveit.ReleaseEvent',  COUNT(*) FROM moveit.ReleaseEvent
UNION ALL SELECT 'moveit.WorkItemLink',  COUNT(*) FROM moveit.WorkItemLink
UNION ALL SELECT 'core.SelectItem (list members)', COUNT(*) FROM core.SelectItem x JOIN core.SelectItem y ON y.Id = x.MasterId WHERE y.Identifier IN ('stages','release-kinds','work-item-kinds','link-kinds','event-kinds');
"@
