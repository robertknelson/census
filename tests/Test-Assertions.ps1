<#
.SYNOPSIS
    Pins Census's config documents held in AppTrak (census-on-apptrak.md §6, T-slices) against a running Census.Web.
.DESCRIPTION
    For every document the app holds in the database (Census:AssertionsInDatabase), after an Import from its file:
      - Export is the file, by meaning (property order and spacing aside);
      - saving it unchanged through its own API changes no row;
      - a change to one unit through the API, made while impersonating demo-sam, is one audited row
        (updated, ChangedBy demo-sam, ImpersonatedBy you), and the file on disk is untouched;
      - saving the original back restores the export.
    Then the reset: the documents read empty after one, and come back whole with its restore.
    Run with the app on the demo fleet's Census paths. Signed in as you, a system administrator. Never against the real
    server.

      .\tests\Test-Assertions.ps1
#>
param(
    [string]$BaseUrl = 'http://localhost:5292',
    [string]$Server = 'localhost',
    [string]$Database = 'AppTrak'
)
$ErrorActionPreference = 'Stop'

$script:passed = 0
$script:failed = 0
function Assert-That {
    param([string]$Name, [bool]$Condition, $Actual = '')
    if ($Condition) { $script:passed++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else            { $script:failed++; Write-Host "  FAIL  $Name  [actual: $Actual]" -ForegroundColor Red }
}
$c = @{ UseDefaultCredentials = $true; AllowUnencryptedAuthentication = $true; SkipHttpErrorCheck = $true }
function Call([string]$Method, [string]$Path, [string]$Json) {
    $a = @{ Uri = "$BaseUrl$Path"; Method = $Method }
    if ($Json) { $a.Body = [System.Text.Encoding]::UTF8.GetBytes($Json); $a.ContentType = 'application/json; charset=utf-8' }
    $r = Invoke-WebRequest @a @c
    return @{ Status = [int]$r.StatusCode; Content = $r.Content }
}
function Sql([string]$Text) {
    $conn = [System.Data.SqlClient.SqlConnection]::new("Server=$Server;Database=$Database;Integrated Security=true;TrustServerCertificate=true")
    $conn.Open()
    try { $m = $conn.CreateCommand(); $m.CommandText = $Text; $t = [System.Data.DataTable]::new(); $rd = $m.ExecuteReader(); try { $t.Load($rd) } finally { $rd.Dispose() }; return ,[object[]]@($t.Rows | ForEach-Object { $_ }) }
    finally { $conn.Dispose() }
}
# Meaning, not text: parse and re-serialize with sorted keys, so property order and spacing do not count.
function Canon($json) {
    function Sort-Node($n) {
        if ($n -is [System.Management.Automation.PSCustomObject]) { $o = [ordered]@{}; foreach ($p in ($n.PSObject.Properties.Name | Sort-Object)) { $o[$p] = Sort-Node $n.$p }; return $o }
        if ($n -is [System.Collections.IEnumerable] -and $n -isnot [string]) { return ,@($n | ForEach-Object { Sort-Node $_ }) }
        return $n
    }
    (Sort-Node ($json | ConvertFrom-Json)) | ConvertTo-Json -Depth 64 -Compress
}

# Each document: where its API reads it, how its API saves it (the whole document, as the pages do), and one unit to
# change (the scriptblock edits the parsed document and returns that unit's key).
function First($o) { $o.PSObject.Properties.Name | Select-Object -First 1 }
function PutWhole([string]$Path) { $Path }
# Saves through the document's API: a PUT of the whole document, or the document's own scriptblock.
function SaveVia($api, [string]$json) { if ($api.Put -is [string]) { (Call Put $api.Put $json).Status } else { & $api.Put $json } }
$apis = [ordered]@{
    'entity-tags' = @{ Get = '/api/entity-tags'; Put = (PutWhole '/api/entity-tags')
        Change = { param($d) $m = First $d.databases; $ct = First $d.databases.$m; $leaf = First $d.databases.$m.$ct; $d.databases.$m.$ct.$leaf | Add-Member -NotePropertyName assertedBy -NotePropertyValue 'test-assertions' -Force; ,@('databases', $m, $ct, $leaf) } }
    'systems' = @{ Get = '/api/systems'; Put = (PutWhole '/api/systems')
        Change = { param($d) $n = First $d.systems; $d.systems.$n | Add-Member -NotePropertyName note -NotePropertyValue 'test-assertions' -Force; ,@('systems', $n) } }
    'stage-crossings' = @{ Get = '/api/stage-crossings'; Put = (PutWhole '/api/stage-crossings')
        Change = { param($d) $a = @($d.accepted)[0]; $a | Add-Member -NotePropertyName note -NotePropertyValue 'test-assertions' -Force; ,@('accepted[]', "$($a.caller)|$($a.target)") } }
    'declared-entities' = @{ Get = '/api/declared-entities'; Put = (PutWhole '/api/declared-entities')
        Change = { param($d) $m = First $d.onMachines; $e = First $d.onMachines.$m; $d.onMachines.$m.$e | Add-Member -NotePropertyName note -NotePropertyValue 'test-assertions' -Force; ,@('onMachines', $m, $e) } }
    'assets' = @{ Get = '/api/admin/assertions/assets/export'
        Put = { param($json) $d = $json | ConvertFrom-Json; $codes = foreach ($m in $d.assets.PSObject.Properties.Name) { $e = $d.assets.$m; (Call Put "/api/assets/$m" (@{ class = $e.class; facets = $e.facets } | ConvertTo-Json -Depth 10 -Compress)).Status }; if (@($codes | Where-Object { $_ -notin 200, 204 }).Count) { 400 } else { 204 } }
        Change = { param($d) $m = First $d.assets; $f = $d.assets.$m.facets; $k = First $f; $f.$k = @($f.$k) + 'test-assertions'; ,@('assets', $m) } }
    'baselines' = @{ Get = '/api/baselines/config'; Put = (PutWhole '/api/baselines')
        Change = { param($d) $b = @($d.baselines)[0]; $b | Add-Member -NotePropertyName note -NotePropertyValue 'test-assertions' -Force; ,@('baselines[]', $b.id) } }
    'blacklist' = @{ Get = '/api/blacklist'; Put = (PutWhole '/api/blacklist')
        Change = { param($d) $r = @($d.rules)[0]; $r.reason = 'test-assertions'; ,@('rules[]', $r.id) } }
    'views' = @{ Get = '/api/views'; Put = (PutWhole '/api/views')
        Change = { param($d) $v = @($d.views)[0]; $v.name = 'test-assertions'; ,@('views[]', $v.id) } }
}

$documents = @((Call Get '/api/admin/assertions').Content | ConvertFrom-Json | Where-Object inDatabase)
Assert-That 'at least one document is held in the database' ($documents.Count -gt 0) ($documents.Count)
$self = ((Call Get '/api/personas/me').Content | ConvertFrom-Json).canonical.identifier

foreach ($doc in $documents) {
    $name = $doc.document
    Write-Host $name
    $fileHash = (Get-FileHash $doc.file).Hash
    $import = Call Post "/api/admin/assertions/$name/import"
    Assert-That 'import from its file: 200' ($import.Status -eq 200) "$($import.Status) $($import.Content)"
    $export = (Call Get "/api/admin/assertions/$name/export").Content
    Assert-That 'export is the file, by meaning' ((Canon $export) -eq (Canon (Get-Content $doc.file -Raw)))

    $api = $apis[$name]
    if (-not $api) { Assert-That "a write check is declared for $name" $false; continue }
    # The first save through the API puts the document in its model's form (an absent list becomes [], as a file
    # saved from a page would); from then on, saving it unchanged must change nothing.
    Assert-That 'the first save through its API: 200 or 204' ((SaveVia $api (Call Get $api.Get).Content) -in 200, 204)
    $settled = (Call Get "/api/admin/assertions/$name/export").Content
    $original = (Call Get $api.Get).Content
    $before = (Sql "SELECT COUNT(*) AS N FROM census.AssertionAudit WHERE Document = '$name'")[0].N
    Assert-That 'saved again unchanged: no row changes' ((SaveVia $api $original) -in 200, 204 -and (Sql "SELECT COUNT(*) AS N FROM census.AssertionAudit WHERE Document = '$name'")[0].N -eq $before)

    Call Post '/api/impersonation' '{"identifier":"demo-sam"}' | Out-Null
    try {
        $d = $original | ConvertFrom-Json
        $path = & $api.Change $d
        $key = ConvertTo-Json -InputObject @($path) -Compress
        $put = SaveVia $api ($d | ConvertTo-Json -Depth 64 -Compress)
        $new = Sql "SELECT EntityKey, Action, ChangedBy, ImpersonatedBy FROM census.AssertionAudit WHERE Document = '$name' ORDER BY AssertionAuditId DESC OFFSET 0 ROWS FETCH NEXT ((SELECT COUNT(*) FROM census.AssertionAudit WHERE Document = '$name') - $before) ROWS ONLY"
        Assert-That 'one unit changed through the API: one audited row, as demo-sam with you beside it' ($put -in 200, 204 -and $new.Count -eq 1 -and ((@($new[0].EntityKey | ConvertFrom-Json) -join '/') -eq (@($path) -join '/')) -and $new[0].Action -eq 'updated' -and $new[0].ChangedBy -eq 'demo-sam' -and $new[0].ImpersonatedBy -eq $self) (($new | ForEach-Object { "$($_.EntityKey) $($_.Action) $($_.ChangedBy)/$($_.ImpersonatedBy)" }) -join '; ')
    }
    finally { Call Post '/api/impersonation/stop' '{}' | Out-Null }
    Assert-That 'the file on disk is untouched' ((Get-FileHash $doc.file).Hash -eq $fileHash)
    Assert-That 'save the original back' ((SaveVia $api $original) -in 200, 204)
    Assert-That 'export is as it was before the change' ((Canon (Call Get "/api/admin/assertions/$name/export").Content) -eq (Canon $settled))
}

Write-Host 'The reset'
$snapshots = @{}; foreach ($doc in $documents) { $snapshots[$doc.document] = (Call Get "/api/admin/assertions/$($doc.document)/export").Content }
$reset = Call Post '/api/admin/reset' '{"confirm":"RESET","reason":"Test-Assertions.ps1"}'
$id = ($reset.Content | ConvertFrom-Json).key
Assert-That 'reset: 200' ($reset.Status -eq 200) $reset.Content
foreach ($doc in $documents) { Assert-That "  $($doc.document) reads empty" ((Call Get "/api/admin/assertions/$($doc.document)/export").Content -eq '{}') }
$restore = Call Post "/api/admin/reset/$id/restore" '{}'
Assert-That 'restore: 200' ($restore.Status -eq 200) $restore.Content
foreach ($doc in $documents) { Assert-That "  $($doc.document) is back whole" ((Call Get "/api/admin/assertions/$($doc.document)/export").Content -eq $snapshots[$doc.document]) }

Write-Host ''
Write-Host "$script:passed passed, $script:failed failed"
if ($script:failed -gt 0) { exit 1 }
