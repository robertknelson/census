<#
.SYNOPSIS
    Pins sign-in and impersonation (census-on-apptrak.md §10, D-005) against a running Census.Web.
.DESCRIPTION
    Signs in as you (Windows, -UseDefaultCredentials). Three modes, one per way the app can be started:

      -Mode Admin     (default) you are a system administrator: appsettings.Local.json lists you in
                      Authorization:SystemAdministrators, Impersonation:IsEnabled is on (Development).
                      Impersonates demo-paula and demo-sam, checks what they see, and that a write while
                      impersonating records them in ChangedBy and you in ImpersonatedBy on all three audit
                      tables. Every row it writes is removed again.
      -Mode NonAdmin  started with $env:Authorization__SystemAdministrators__0 = 'nobody', so you are not
                      one: View as is not offered, and every administrator endpoint answers 403.
      -Mode Disabled  started with $env:Impersonation__IsEnabled = 'false': you are an administrator, View
                      as is not offered, impersonate answers 403, stop still answers 200.

      cd Census.Web; dotnet run --launch-profile http
#>
param(
    [string]$BaseUrl = 'http://localhost:5292',
    [ValidateSet('Admin', 'NonAdmin', 'Disabled')] [string]$Mode = 'Admin',
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
function Call {
    param([string]$Method, [string]$Path, $Body, [hashtable]$Headers = @{}, [switch]$Anonymous)
    if ($Anonymous) {
        # A fresh client: Negotiate signs in the connection, and a pooled one from an earlier signed-in call would pass.
        $client = [System.Net.Http.HttpClient]::new([System.Net.Http.HttpClientHandler]@{ UseDefaultCredentials = $false })
        try { return @{ Status = [int]$client.Send([System.Net.Http.HttpRequestMessage]::new($Method, "$BaseUrl$Path")).StatusCode; Body = $null } }
        finally { $client.Dispose() }
    }
    $a = @{ Uri = "$BaseUrl$Path"; Method = $Method; Headers = $Headers; SkipHttpErrorCheck = $true }
    if (-not $Anonymous) { $a.UseDefaultCredentials = $true; $a.AllowUnencryptedAuthentication = $true }
    if ($null -ne $Body) { $a.ContentType = 'application/json'; $a.Body = ($Body | ConvertTo-Json -Depth 5) }
    $r = Invoke-WebRequest @a
    return @{ Status = [int]$r.StatusCode; Body = if ($r.Content) { try { $r.Content | ConvertFrom-Json } catch { $r.Content } } else { $null } }
}
function Sql {
    param([string]$Text)
    $c = [System.Data.SqlClient.SqlConnection]::new("Server=$Server;Database=$Database;Integrated Security=true;TrustServerCertificate=true")
    $c.Open()
    try {
        $m = $c.CreateCommand(); $m.CommandText = $Text
        $t = [System.Data.DataTable]::new(); $r = $m.ExecuteReader(); try { $t.Load($r) } finally { $r.Dispose() }
        return ,[object[]]@($t.Rows | ForEach-Object { $_ })
    } finally { $c.Dispose() }
}
function Me { (Call Get '/api/personas/me').Body }

Write-Host "Sign-in ($Mode)"
Assert-That 'no credentials: 401' ((Call Get '/api/personas/me' -Anonymous).Status -eq 401)
Assert-That 'no credentials, a page: 401' ((Call Get '/personas' -Anonymous).Status -eq 401)
$me = Me
$self = $me.canonical.identifier
Assert-That "signed in as yourself ($self), not impersonating" ($self -and $me.identifier -eq $self -and -not $me.impersonating) ($me | ConvertTo-Json -Compress -Depth 4)
$forged = (Call Get '/api/personas/me' -Headers @{ 'X-Census-Member' = 'demo-paula' }).Body
Assert-That 'a forged X-Census-Member header changes nothing' ($forged.identifier -eq $self)

if ($Mode -eq 'NonAdmin' -and $me.administer) {
    # The refusals below are real writes when they are not refused (a reset among them): never run them as an administrator.
    Write-Host '  STOP  you are an administrator here, so -Mode NonAdmin would really write. Start the app with $env:Authorization__SystemAdministrators__0 = ''nobody''.' -ForegroundColor Red
    exit 1
}
if ($Mode -eq 'NonAdmin') {
    Assert-That 'not an administrator: Administer and View as not offered' (-not $me.administer -and -not $me.canImpersonate)
    Assert-That 'impersonate: 403' ((Call Post '/api/impersonation' @{ identifier = 'demo-paula' }).Status -eq 403)
    Assert-That 'stop: 403' ((Call Post '/api/impersonation/stop' @{}).Status -eq 403)
    Assert-That 'the member list: 403' ((Call Get '/api/personas/members').Status -eq 403)
    Assert-That 'another member''s access: 403' ((Call Get '/api/personas/members/demo-sam').Status -eq 403)
    Assert-That 'membership API: 403' ((Call Get '/api/membership/applications').Status -eq 403)
    Assert-That 'feature access API: 403' ((Call Get '/api/feature-access/features').Status -eq 403)
    $s = (Call Get '/api/admin/reset').Body
    Assert-That 'reset status: not allowed, and why' (-not $s.allowed -and ($s.why -join ' ') -like '*system administrator*')
    Assert-That 'reset: 403' ((Call Post '/api/admin/reset' @{ confirm = 'RESET'; reason = 'x' }).Status -eq 403)
    Assert-That 'restore: 403' ((Call Post '/api/admin/reset/1/restore' @{}).Status -eq 403)
}
elseif ($Mode -eq 'Disabled') {
    Assert-That 'switched off: Administer offered, View as not' ($me.administer -and -not $me.canImpersonate)
    Assert-That 'impersonate: 403' ((Call Post '/api/impersonation' @{ identifier = 'demo-paula' }).Status -eq 403)
    Assert-That 'stop: still 200' ((Call Post '/api/impersonation/stop' @{}).Status -eq 200)
}
else {
    Assert-That 'an administrator: Administer and View as offered' ($me.administer -and $me.canImpersonate)
    Assert-That 'the member list for View as: 200' ((Call Get '/api/personas/members').Status -eq 200)
    Assert-That 'impersonate yourself: 400' ((Call Post '/api/impersonation' @{ identifier = $self }).Status -eq 400)
    Assert-That 'impersonate nobody: 400' ((Call Post '/api/impersonation' @{ identifier = '' }).Status -eq 400)
    Assert-That 'impersonate an unknown member: 404' ((Call Post '/api/impersonation' @{ identifier = 'no-such-member' }).Status -eq 404)

    Write-Host 'As demo-paula (product owner on Reporting and WidgetCore)'
    Assert-That 'impersonate: 200' ((Call Post '/api/impersonation' @{ identifier = 'demo-paula' }).Status -eq 200)
    $as = Me
    Assert-That 'requests now run as her; you are still the real user' ($as.identifier -eq 'demo-paula' -and $as.impersonating -and $as.canonical.identifier -eq $self) ($as | ConvertTo-Json -Compress -Depth 4)
    $apps = @($as.access.applications | ForEach-Object { $_.name }) | Sort-Object
    Assert-That 'her applications, and only hers' (($apps -join ',') -eq 'Reporting,WidgetCore') ($apps -join ',')
    Assert-That 'her features: no curate, no Log Explorer' (-not ($as.access.features -match '^curate\.|view\.log-explorer')) ($as.access.features -join ',')
    Assert-That 'Administer carries through (the way out)' ($as.administer -and $as.canImpersonate)
    $again = Call Post '/api/impersonation' @{ identifier = 'demo-sam' }
    Assert-That 'switch straight to another member: 200' ($again.Status -eq 200 -and (Me).identifier -eq 'demo-sam')
    Call Post '/api/impersonation' @{ identifier = 'demo-paula' } | Out-Null

    Write-Host 'A write while impersonating records both'
    $rel = Call Post '/api/edit/release' @{ applicationId = 1; name = 'Test-Identity release'; kind = 'featureset' }
    $relId = [int]$rel.Body.key
    Call Post "/api/edit/release/$relId/delete" @{} | Out-Null
    $rows = Sql "SELECT Action, ChangedBy, ImpersonatedBy FROM moveit.EditAudit WHERE Entity = 'release' AND EntityId = $relId ORDER BY EditAuditId"
    Assert-That 'Move It: created and deleted, ChangedBy demo-paula, ImpersonatedBy you' ($rel.Status -eq 200 -and $rows.Count -eq 2 -and @($rows | Where-Object { $_.ChangedBy -eq 'demo-paula' -and $_.ImpersonatedBy -eq $self }).Count -eq 2) (($rows | ForEach-Object { "$($_.Action)/$($_.ChangedBy)/$($_.ImpersonatedBy)" }) -join ' ')

    $ids = (Sql "SELECT (SELECT Id FROM membership.Member WHERE Identifier = 'demo-nova') AS MemberId, (SELECT Id FROM membership.Application WHERE Identifier = 'census') AS ApplicationId, (SELECT r.Id FROM core.SelectItem r JOIN core.SelectItem h ON h.Id = r.MasterId AND h.MasterId = -1 AND h.Identifier = 'member-types' WHERE r.Identifier = 'observer') AS RoleId")[0]
    $grant = @{ memberId = [int]$ids.MemberId; applicationId = [int]$ids.ApplicationId; roleId = [int]$ids.RoleId }
    $g = Call Post '/api/membership/grants/grant' $grant
    $v = Call Post '/api/membership/grants/revoke' $grant
    $rows = Sql "SELECT TOP 2 Action, ChangedBy, ImpersonatedBy FROM membership.MembershipAudit WHERE Entity = 'grant' ORDER BY MembershipAuditId DESC"
    Assert-That 'Membership: granted and revoked, ChangedBy demo-paula, ImpersonatedBy you' ($g.Status -eq 200 -and $v.Status -eq 200 -and @($rows | Where-Object { $_.ChangedBy -eq 'demo-paula' -and $_.ImpersonatedBy -eq $self }).Count -eq 2) "$($g.Status) $($v.Status) " + (($rows | ForEach-Object { "$($_.Action)/$($_.ChangedBy)/$($_.ImpersonatedBy)" }) -join ' ')

    $feature = (Sql "SELECT FeatureId FROM fm.Feature WHERE Name = 'view.week' AND IsVoided = 0")[0].FeatureId
    $fg = Call Post "/api/feature-access/features/$feature/roles/grant" @{ roleName = 'observer' }
    $fr = Call Post "/api/feature-access/features/$feature/roles/revoke" @{ roleName = 'observer' }
    $rows = Sql "SELECT TOP 2 Action, ChangedBy, ImpersonatedBy FROM fm.FeatureAudit WHERE FeatureId = $feature ORDER BY FeatureAuditId DESC"
    Assert-That 'Feature access: role granted and revoked, ChangedBy demo-paula, ImpersonatedBy you' ($fg.Status -eq 200 -and $fr.Status -eq 200 -and @($rows | Where-Object { $_.ChangedBy -eq 'demo-paula' -and $_.ImpersonatedBy -eq $self }).Count -eq 2) "$($fg.Status) $($fr.Status) " + (($rows | ForEach-Object { "$($_.Action)/$($_.ChangedBy)/$($_.ImpersonatedBy)" }) -join ' ')

    Write-Host 'Stop'
    $stop = Call Post '/api/impersonation/stop' @{}
    $back = Me
    Assert-That 'stop: 200, and you are yourself again' ($stop.Status -eq 200 -and $back.identifier -eq $self -and -not $back.impersonating)
    $rel = Call Post '/api/edit/release' @{ applicationId = 1; name = 'Test-Identity release, as yourself'; kind = 'featureset' }
    $relId = [int]$rel.Body.key
    Call Post "/api/edit/release/$relId/delete" @{} | Out-Null
    $rows = Sql "SELECT ChangedBy, ImpersonatedBy FROM moveit.EditAudit WHERE Entity = 'release' AND EntityId = $relId"
    Assert-That 'a write as yourself: ChangedBy you, ImpersonatedBy empty' (@($rows | Where-Object { $_.ChangedBy -eq $self -and $_.ImpersonatedBy -is [DBNull] }).Count -eq 2)
    Assert-That 'stop again: 200, nothing to stop' ((Call Post '/api/impersonation/stop' @{}).Status -eq 200)
}

Write-Host ''
Write-Host "$script:passed passed, $script:failed failed"
if ($script:failed -gt 0) { exit 1 }
