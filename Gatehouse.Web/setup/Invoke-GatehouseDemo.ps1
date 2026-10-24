<#
    Readies Gatehouse for a local run (.docs/features/gatehouse.md §8):
      1. GatehouseDemo, a database for Gatehouse's own fm (fm serves one application, G-R9): FM2280's schema and
         Gatehouse's features with their first grants.
      2. The local AppTrak's membership: the 'gatehouse' application, and you (your Windows username) as a member
         holding -Roles on it. Your name is read here at run time; it is never written in the repo.
      3. The Membership page's audit table (membership.MembershipAudit) and the requests to join
         (membership.MembershipRequest), if they are not there yet.
      4. AppEvent (gatehouse.md §12): the table in the demo logs (CensusLogsDemo, from apptrak\Invoke-LogsDemo.ps1) with
         a week of manufactured units of work, and the catalog of kinds in AppTrak.

    Run Census's apptrak\Invoke-AppTrakDemo.ps1 first (it builds membership and core.SelectItem's member-types list).
    Run again with other -Roles to see the sidebar and the gates change (within Identity:SessionMinutes).

    Usage: .\Invoke-GatehouseDemo.ps1 [-Server localhost] [-Roles system-administrator] [-Identifier $env:USERNAME]
#>
param(
    [string]$Server = 'localhost',
    [string]$FmDatabase = 'GatehouseDemo',
    [string]$AppTrakDatabase = 'AppTrak',
    [string]$LogsDatabase = 'CensusLogsDemo',
    [string]$Identifier = $env:USERNAME,
    [string]$Roles = 'system-administrator'
)
$ErrorActionPreference = 'Stop'

function Invoke-Step([string]$database, [string]$path, [string[]]$variables = @()) {
    Write-Host "-- $path ($database)"
    $arguments = @('-S', $Server, '-d', $database, '-E', '-b', '-I', '-W', '-s', '|', '-i', $path)
    foreach ($v in $variables) { $arguments += @('-v', $v) }
    & sqlcmd @arguments
    if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed on $path (exit $LASTEXITCODE)" }
}

& sqlcmd -S $Server -d master -E -b -Q "IF DB_ID(N'$FmDatabase') IS NULL CREATE DATABASE [$FmDatabase];"
if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed creating $FmDatabase (exit $LASTEXITCODE)" }

$web = Split-Path $PSScriptRoot -Parent
Invoke-Step $FmDatabase (Join-Path $web 'feature-management\sql\ddl\001-fm-schema.sql')
Invoke-Step $FmDatabase (Join-Path $PSScriptRoot 'seed-gatehouse-features.sql')
Invoke-Step $AppTrakDatabase (Join-Path $web 'membership\sql\ddl\001-membership-audit.sql')
Invoke-Step $AppTrakDatabase (Join-Path $web 'membership\sql\ddl\002-membership-request.sql')
Invoke-Step $AppTrakDatabase (Join-Path $PSScriptRoot 'seed-gatehouse-membership.sql') @("Identifier=$Identifier", "Roles=$Roles")
Invoke-Step $AppTrakDatabase (Join-Path $web 'app-events\sql\ddl\002-app-event-kind.sql')
Invoke-Step $AppTrakDatabase (Join-Path $PSScriptRoot 'seed-gatehouse-app-event-kinds.sql')
Invoke-Step $LogsDatabase (Join-Path $web 'app-events\sql\ddl\001-app-event.sql') @('Schema=apptrak')
Invoke-Step $LogsDatabase (Join-Path $web 'app-events\sql\seed\seed-app-events-demo.sql')
