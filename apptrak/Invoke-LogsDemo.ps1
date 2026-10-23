<#
    Builds the demo log database for Log Explorer and Trace (log-explorer-and-trace.md §9): the
    shared log tables, the indexes the real environment gets, and a manufactured month.

    A database of its own (CensusLogsDemo), so the seed never touches log rows in a local AppTrak.
    The real environment gets sql\logs\001-log-indexes.sql only; it never gets seed\.

    Usage: .\Invoke-LogsDemo.ps1 [-Server localhost] [-Database CensusLogsDemo]
#>
param(
    [string]$Server = 'localhost',
    [string]$Database = 'CensusLogsDemo'
)
$ErrorActionPreference = 'Stop'

& sqlcmd -S $Server -d master -E -b -Q "IF DB_ID(N'$Database') IS NULL CREATE DATABASE [$Database];"
if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed creating $Database (exit $LASTEXITCODE)" }

foreach ($step in 'seed\logs-demo-ddl.sql', 'sql\logs\001-log-indexes.sql', 'seed\seed-logs-demo.sql') {
    $path = Join-Path $PSScriptRoot $step
    Write-Host "-- $step"
    & sqlcmd -S $Server -d $Database -E -b -I -W -s '|' -i $path
    if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed on $step (exit $LASTEXITCODE)" }
}
