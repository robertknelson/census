<#
.SYNOPSIS
    Runs every Move It entry write once on an empty slate and saves what they answered and what they left, ids and
    times masked, so two runs (before and after a change) can be compared byte for byte.
.DESCRIPTION
    Written for the move onto command/query (census-on-apptrak.md §3, C-1). Uses the reset (§5) as its harness: reset
    (keeping your rows), run the writes, save, reset again, restore yours. The local AppTrak ends as it began. Needs the
    app running, you a system administrator, impersonation off, the database armed. Never point it at the real server.

      .\tests\Capture-Entry.ps1 -Out C:\temp\entry-before.txt
#>
param(
    [Parameter(Mandatory)] [string]$Out,
    [string]$BaseUrl = 'http://localhost:5292',
    [string]$Server = 'localhost',
    [string]$Database = 'AppTrak'
)
$ErrorActionPreference = 'Stop'
$c = @{ UseDefaultCredentials = $true; AllowUnencryptedAuthentication = $true; SkipHttpErrorCheck = $true; ContentType = 'application/json' }
$lines = [System.Collections.Generic.List[string]]::new()

function Post([string]$Path, $Body) {
    $r = Invoke-WebRequest -Uri "$BaseUrl$Path" -Method Post -Body ($Body | ConvertTo-Json -Depth 5 -Compress) @c
    $masked = $r.Content -replace '"(\w*[Ii]d)":\d+', '"$1":"#"'
    $lines.Add("POST $Path -> $([int]$r.StatusCode) $masked")
    return ($r.Content | ConvertFrom-Json)
}
function Sql([string]$Text) {
    $conn = [System.Data.SqlClient.SqlConnection]::new("Server=$Server;Database=$Database;Integrated Security=true;TrustServerCertificate=true")
    $conn.Open()
    try {
        $m = $conn.CreateCommand(); $m.CommandText = $Text
        $sb = [System.Text.StringBuilder]::new(); $r = $m.ExecuteReader()
        try { while ($r.Read()) { if (-not $r.IsDBNull(0)) { [void]$sb.Append($r.GetString(0)) } } } finally { $r.Dispose() }
        return $sb.ToString()
    } finally { $conn.Dispose() }
}

$mine = Post '/api/admin/reset' @{ confirm = 'RESET'; reason = 'Capture-Entry.ps1: keep the rows while the entry writes run on an empty slate' }
$lines.Clear()
try {
    $heard = Post '/api/moveit/add-item' @{ applicationId = 1; kind = 'feature'; title = 'Heard about'; note = 'from a hallway' }
    Post '/api/moveit/add-item' @{ applicationId = 1; kind = 'feature'; title = 'Heard about'; note = 'again' } | Out-Null
    Post '/api/moveit/add-item' @{ applicationId = 1; kind = 'sprint'; title = '' } | Out-Null
    $nb = @{ applicationId = 1; build = 'B-1'; release = @{ name = 'R1'; kind = 'featureset'; targetDate = '2026-12-01'; note = 'first' }
             items = @(@{ kind = 'feature'; title = 'F1'; builtBy = 'dev-a'; inThisBuild = $true }, @{ kind = 'fix'; title = 'X1'; foundInStage = 'VAL' })
             schedule = @([int]$heard.Id) }
    $r1 = Post '/api/moveit/name-build' $nb
    Post '/api/moveit/name-build' $nb | Out-Null
    $r2 = Post '/api/moveit/name-build' @{ applicationId = 1; release = @{ name = 'R2'; kind = 'hotfix' } }
    Post '/api/moveit/name-build' @{ applicationId = 0; release = @{ name = ''; kind = 'x'; targetDate = 'soon' }; attach = @(1) } | Out-Null
    Post '/api/moveit/event' @{ releaseId = $r1.releaseId; kind = 'approved'; stage = 'VAL'; build = 'B-1'; at = '2026-11-01T10:00:00Z'; by = 'qa' } | Out-Null
    Post '/api/moveit/event' @{ releaseId = $r1.releaseId; kind = 'approved'; stage = 'VAL'; build = 'B-1'; at = '2026-11-01T10:00:00Z'; by = 'qa' } | Out-Null
    Post '/api/moveit/event' @{ releaseId = $r1.releaseId; kind = 'party'; stage = 'MOON'; at = 'later'; by = '' } | Out-Null
    $items = Sql "SELECT (SELECT Id, Title FROM moveit.WorkItem FOR JSON PATH)" | ConvertFrom-Json
    $f1 = ($items | Where-Object Title -eq 'F1').Id
    $x1 = ($items | Where-Object Title -eq 'X1').Id
    Post '/api/moveit/retitle' @{ workItemId = $f1; title = 'F1 renamed' } | Out-Null
    Post '/api/moveit/retitle' @{ workItemId = 0; title = '' } | Out-Null
    Post '/api/moveit/pull-item' @{ workItemId = $x1; note = 'not this time' } | Out-Null
    Post '/api/moveit/claim-build' @{ releaseId = $r1.releaseId; build = 'B-2'; note = 'claimed' } | Out-Null
    Post '/api/moveit/claim-build' @{ releaseId = $r1.releaseId; build = 'B-2' } | Out-Null
    Post '/api/moveit/release-build' @{ releaseId = $r1.releaseId; build = 'B-2'; by = 'lead'; note = 'wrong release' } | Out-Null
    Post '/api/moveit/release-build' @{ releaseId = $r1.releaseId; build = 'B-2'; by = 'lead' } | Out-Null
    Post '/api/moveit/move-build' @{ releaseId = $r1.releaseId; toReleaseId = $r2.releaseId; build = 'B-1'; by = 'lead' } | Out-Null
    Post '/api/moveit/move-build' @{ releaseId = $r1.releaseId; toReleaseId = $r1.releaseId; build = 'B-1'; by = '' } | Out-Null
    Post '/api/moveit/delete-release' @{ releaseId = $r2.releaseId } | Out-Null
    Post '/api/moveit/delete-release' @{ releaseId = $r2.releaseId } | Out-Null

    $lines.Add('--- left behind (ids and times masked)')
    $lines.Add((Sql "SELECT (SELECT ApplicationId, Name, Kind, TargetDate, Note, CreatedBy FROM moveit.Release ORDER BY Name FOR JSON PATH, INCLUDE_NULL_VALUES)"))
    $lines.Add((Sql "SELECT (SELECT w.ApplicationId, r.Name AS ReleaseName, w.Kind, w.Title, w.Description, w.BuiltBy, w.ExternalRef, w.IncludedInBuild, w.FoundInStage, CAST(CASE WHEN w.RemovedAt IS NULL THEN 0 ELSE 1 END AS bit) AS Removed, w.RemovedNote, w.CreatedBy FROM moveit.WorkItem w LEFT JOIN moveit.Release r ON r.Id = w.ReleaseId ORDER BY w.Title FOR JSON PATH, INCLUDE_NULL_VALUES)"))
    $lines.Add((Sql "SELECT (SELECT r.Name AS ReleaseName, b.Build, b.Note, b.CreatedBy FROM moveit.ReleaseBuild b JOIN moveit.Release r ON r.Id = b.ReleaseId ORDER BY r.Name, b.Build FOR JSON PATH, INCLUDE_NULL_VALUES)"))
    $lines.Add((Sql "SELECT (SELECT r.Name AS ReleaseName, e.Kind, e.Stage, e.Build, e.[By], e.Note, e.CreatedBy FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId ORDER BY r.Name, e.Kind, e.Build FOR JSON PATH, INCLUDE_NULL_VALUES)"))
}
finally {
    $saved = $lines.ToArray()
    Post '/api/admin/reset' @{ confirm = 'RESET'; reason = 'Capture-Entry.ps1: clear what the entry writes left' } | Out-Null
    $back = Post "/api/admin/reset/$($mine.key)/restore" @{}
    Set-Content -Path $Out -Value (($saved -join "`n") -replace 'release \d+', 'release #')
    Write-Host "$($saved.Count) lines saved to $Out; your rows restored from reset #$($mine.key): $($back.key -eq $mine.key)"
}
