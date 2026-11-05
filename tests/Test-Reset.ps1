<#
.SYNOPSIS
    Pins the reset (census-on-apptrak.md §5, D-003): the scripts on a scratch database, then the API.
.DESCRIPTION
    SQL half: builds a scratch database (ResetScratch) holding a copy of the Move It rows in -Source,
    and checks that an unarmed database refuses, that a reset empties every asserted table and leaves
    the observed one (moveit.Deployment) alone, that a restore brings back every row byte for byte
    (FOR JSON of each table, hashed), and what a restore refuses. Drops the scratch database at the end.

    API half (-BaseUrl, Census.Web running on the local AppTrak, armed, Reset:Allowed true, you signed in
    as a system administrator): the status, the refusals (no reason, no RESET), then a reset and the
    restore of it, so the local AppTrak ends as it began. A non-administrator's 403s are Test-Identity.ps1
    -Mode NonAdmin's. Never point it at the real server.

      .\tests\Test-Reset.ps1                                  # SQL half only
      .\tests\Test-Reset.ps1 -BaseUrl http://localhost:5292   # both halves
#>
param(
    [string]$Server = 'localhost',
    [string]$Source = 'AppTrak',
    [string]$BaseUrl
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$sql = Join-Path $repo 'apptrak\sql'
$scratch = 'ResetScratch'

$script:passed = 0
$script:failed = 0
function Assert-That {
    param([string]$Name, [bool]$Condition, $Actual = '')
    if ($Condition) { $script:passed++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else            { $script:failed++; Write-Host "  FAIL  $Name  [actual: $Actual]" -ForegroundColor Red }
}

function Invoke-Sql {
    param([string]$Database, [string]$Text, [hashtable]$Params = @{})
    $conn = [System.Data.SqlClient.SqlConnection]::new("Server=$Server;Database=$Database;Integrated Security=true;TrustServerCertificate=true")
    $conn.Open()
    try {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $Text
        foreach ($k in $Params.Keys) { [void]$cmd.Parameters.AddWithValue("@$k", $Params[$k]) }
        $table = [System.Data.DataTable]::new()
        $reader = $cmd.ExecuteReader()
        try { $table.Load($reader) } finally { $reader.Dispose() }
        return ,[object[]]@($table.Rows | ForEach-Object { $_ })
    } finally { $conn.Dispose() }
}
function Invoke-File { param([string]$Database, [string]$File, [hashtable]$Params = @{}) Invoke-Sql $Database (Get-Content (Join-Path $sql $File) -Raw) $Params }
function Get-Refusal {
    param([scriptblock]$Call)
    try { & $Call; return $null } catch { $e = $_.Exception; while ($e -and $e -isnot [System.Data.SqlClient.SqlException]) { $e = $e.InnerException }; return $e }
}

$tables = 'Release', 'WorkItem', 'ReleaseBuild', 'ReleaseEvent', 'WorkItemLink', 'EditAudit'
function Get-Fingerprint {
    param([string]$Database)
    $parts = foreach ($t in $tables + 'Deployment') {
        $row = Invoke-Sql $Database "SELECT COUNT(*) AS N, CONVERT(varchar(64), HASHBYTES('SHA2_256', (SELECT * FROM moveit.$t ORDER BY 1 FOR JSON PATH, INCLUDE_NULL_VALUES)), 2) AS H FROM moveit.$t"
        "$t=$($row[0].N):$($row[0].H)"
    }
    $parts -join ' '
}
function Get-Count { param([string]$Database, [string]$Table) (Invoke-Sql $Database "SELECT COUNT(*) AS N FROM moveit.$Table")[0].N }

Write-Host "Scratch database from $Source's Move It rows"
Invoke-Sql 'master' "IF DB_ID('$scratch') IS NOT NULL BEGIN ALTER DATABASE $scratch SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE $scratch; END; CREATE DATABASE $scratch;" | Out-Null
foreach ($f in '001-create-deployment.sql', '002-create-moveit-schema.sql', 'edit\001-edit-audit.sql', 'identity\001-impersonated-by.sql') {
    foreach ($batch in ((Get-Content (Join-Path $sql $f) -Raw) -split '(?m)^\s*GO\s*$')) { if ($batch.Trim()) { Invoke-Sql $scratch $batch | Out-Null } }
}
foreach ($t in $tables + 'Deployment') {
    $cols = (Invoke-Sql $Source "SELECT STRING_AGG(QUOTENAME(name), ',') WITHIN GROUP (ORDER BY column_id) AS C FROM sys.columns WHERE object_id = OBJECT_ID('moveit.$t') AND is_computed = 0")[0].C
    Invoke-Sql $scratch "SET IDENTITY_INSERT moveit.$t ON; INSERT moveit.$t ($cols) SELECT $cols FROM [$Source].moveit.$t; SET IDENTITY_INSERT moveit.$t OFF;" | Out-Null
}
Invoke-File $scratch 'reset\001-reset-schema.sql' | Out-Null
Invoke-File $scratch 'reset\001-reset-schema.sql' | Out-Null
Assert-That 'the schema script runs twice; six asserted tables listed' ((Invoke-Sql $scratch 'SELECT COUNT(*) AS N FROM reset.AssertedTable')[0].N -eq 6)
$before = Get-Fingerprint $scratch
Assert-That 'the copy holds rows to wipe' ((Get-Count $scratch 'Release') -gt 0 -and (Get-Count $scratch 'Deployment') -gt 0) $before

Write-Host 'Unarmed'
Assert-That 'not armed: the status says so' (-not (Invoke-File $scratch 'reset\armed.sql')[0].Armed)
$e = Get-Refusal { Invoke-File $scratch 'reset\reset-assertions.sql' @{ Actor = 'test'; Reason = 'test' } }
Assert-That 'not armed: the reset refuses 50410 and touches nothing' ($e.Number -eq 50410 -and (Get-Fingerprint $scratch) -eq $before) $e.Message

Write-Host 'Armed'
Invoke-File $scratch 'reset\002-arm-reset.sql' | Out-Null
Invoke-File $scratch 'reset\002-arm-reset.sql' | Out-Null
Assert-That 'arming runs twice; the status says armed' ((Invoke-File $scratch 'reset\armed.sql')[0].Armed)
$e = Get-Refusal { Invoke-File $scratch 'reset\reset-assertions.sql' @{ Actor = 'test'; Reason = '  ' } }
Assert-That 'no reason: refused 50400' ($e.Number -eq 50400) $e.Message
$deployments = Get-Count $scratch 'Deployment'
$id = (Invoke-File $scratch 'reset\reset-assertions.sql' @{ Actor = 'test'; Reason = 'clean slate' })[0].ResetId
$empty = @($tables | Where-Object { (Get-Count $scratch $_) -ne 0 })
Assert-That 'the reset empties every asserted table' ($empty.Count -eq 0) ($empty -join ', ')
Assert-That 'the observed table is untouched' ((Get-Count $scratch 'Deployment') -eq $deployments -and (Get-Fingerprint $scratch).Contains(($before -split ' ' | Where-Object { $_ -like 'Deployment=*' })))
$listed = Invoke-File $scratch 'reset\resets.sql'
Assert-That 'the reset is listed, by whom, why, and how many rows it took' ($listed.Count -eq 1 -and $listed[0].ResetId -eq $id -and $listed[0].By -eq 'test' -and $listed[0].Reason -eq 'clean slate' -and $listed[0].RowsTaken -gt 0) "$($listed[0].RowsTaken)"
$counts = Invoke-File $scratch 'reset\tables.sql'
Assert-That 'the status counts zero rows in each asserted table' (@($counts | Where-Object { $_.RowsNow -ne 0 }).Count -eq 0)

Write-Host 'Restore'
Invoke-Sql $scratch "INSERT moveit.Release (ApplicationId, Name, Kind, CreatedBy) VALUES (1, 'written after', 'featureset', 'test')" | Out-Null
$e = Get-Refusal { Invoke-File $scratch 'reset\restore-assertions.sql' @{ ResetId = $id; Actor = 'test' } }
Assert-That 'a row written since: restore refuses 50410 and names the table' ($e.Number -eq 50410 -and $e.Message -like '*moveit.Release (1)*') $e.Message
$second = (Invoke-File $scratch 'reset\reset-assertions.sql' @{ Actor = 'test'; Reason = 'keep the newer row' })[0].ResetId
Invoke-File $scratch 'reset\restore-assertions.sql' @{ ResetId = $id; Actor = 'test' } | Out-Null
$after = Get-Fingerprint $scratch
Assert-That 'reset again, then restore: every row back, byte for byte, ids and all' ($after -eq $before) "`n    before $before`n    after  $after"
$e = Get-Refusal { Invoke-File $scratch 'reset\restore-assertions.sql' @{ ResetId = $id; Actor = 'test' } }
Assert-That 'restored already: refused 50410' ($e.Number -eq 50410) $e.Message
$e = Get-Refusal { Invoke-File $scratch 'reset\restore-assertions.sql' @{ ResetId = 999; Actor = 'test' } }
Assert-That 'no such reset: refused 50404' ($e.Number -eq 50404) $e.Message
$kept = (Invoke-Sql $scratch "SELECT RowsJson FROM reset.Snapshot WHERE ResetId = $second AND TableName = 'moveit.Release'")[0].RowsJson
Assert-That 'the second reset kept the row written after the first' ($kept -like '*written after*')
$new = (Invoke-Sql $scratch "INSERT moveit.Release (ApplicationId, Name, Kind, CreatedBy) OUTPUT inserted.Id VALUES (1, 'next', 'featureset', 'test')")[0].Id
$max = (Invoke-Sql $scratch "SELECT MAX(Id) AS M FROM moveit.Release WHERE Name <> 'next'")[0].M
Assert-That 'a new row after a restore takes an id above every restored one' ($new -gt $max) "$new vs $max"

Invoke-Sql 'master' "ALTER DATABASE $scratch SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE $scratch;" | Out-Null

if ($BaseUrl) {
    Write-Host "API ($BaseUrl, on $Source)"
    function Call {
        param([string]$Method, [string]$Path, $Body)
        $args = @{ Uri = "$BaseUrl$Path"; Method = $Method; UseDefaultCredentials = $true; AllowUnencryptedAuthentication = $true; SkipHttpErrorCheck = $true }
        if ($Body) { $args.ContentType = 'application/json'; $args.Body = ($Body | ConvertTo-Json) }
        $r = Invoke-WebRequest @args
        return @{ Status = [int]$r.StatusCode; Body = if ($r.Content) { $r.Content | ConvertFrom-Json } else { $null } }
    }
    $sourceBefore = Get-Fingerprint $Source
    $s = Call Get '/api/admin/reset'
    Assert-That 'status for you, a system administrator: allowed, the tables and their rows' ($s.Status -eq 200 -and $s.Body.allowed -and $s.Body.tables.Count -eq (Invoke-Sql $Source 'SELECT COUNT(*) AS N FROM reset.AssertedTable')[0].N) ($s.Body | ConvertTo-Json -Compress -Depth 4)
    $r = Call Post '/api/admin/reset' @{ confirm = 'reset please'; reason = 'x' }
    Assert-That 'without the word RESET: 400' ($r.Status -eq 400) $r.Status
    $r = Call Post '/api/admin/reset' @{ confirm = 'RESET'; reason = '' }
    Assert-That 'without a reason: 400' ($r.Status -eq 400) $r.Status
    Assert-That 'nothing changed yet' ((Get-Fingerprint $Source) -eq $sourceBefore)
    $r = Call Post '/api/admin/reset' @{ confirm = 'RESET'; reason = 'Test-Reset.ps1' }
    $s = Call Get '/api/admin/reset'
    Assert-That 'reset: 200, every asserted table empty, the reset listed first' ($r.Status -eq 200 -and @($s.Body.tables | Where-Object { $_.rowsNow -ne 0 }).Count -eq 0 -and $s.Body.resets[0].resetId -eq [int]$r.Body.key) ($r.Body | ConvertTo-Json -Compress)
    $back = Call Post "/api/admin/reset/$($r.Body.key)/restore"
    Assert-That 'restore: 200, and the source is as it began' ($back.Status -eq 200 -and (Get-Fingerprint $Source) -eq $sourceBefore) $back.Status
    Assert-That 'restore again: 409' ((Call Post "/api/admin/reset/$($r.Body.key)/restore").Status -eq 409)
}

Write-Host ''
Write-Host "$script:passed passed, $script:failed failed"
if ($script:failed -gt 0) { exit 1 }
