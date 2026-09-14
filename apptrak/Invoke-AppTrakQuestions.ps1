<#
    Runs every question in sql/questions/ against an AppTrak database and prints the answers.

    WHY THIS EXISTS. Each Appendix A question in move-it.md is one read-only .sql file (rule 9):
    the board and the inbox will read them, and a wrong answer is a wrong query, fixed without
    touching a table. Running them all against the fixtures is how each branch of the seed is
    proven, and running them against the real database is the field trial's first board.

    Usage: .\Invoke-AppTrakQuestions.ps1 [-Server localhost] [-Database AppTrak] [-Only 03]
#>
param(
    [string]$Server = 'localhost',
    [string]$Database = 'AppTrak',
    [string]$Only
)
$ErrorActionPreference = 'Stop'

$files = Get-ChildItem (Join-Path $PSScriptRoot 'sql\questions') -Filter '*.sql' | Sort-Object Name
if ($Only) { $files = $files | Where-Object { $_.Name -like "$Only*" } }

foreach ($f in $files) {
    Write-Host ''
    Write-Host "== $($f.Name)" -ForegroundColor Cyan
    & sqlcmd -S $Server -d $Database -E -I -b -W -s '|' -i $f.FullName
    if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed on $($f.Name) (exit $LASTEXITCODE)" }
}
