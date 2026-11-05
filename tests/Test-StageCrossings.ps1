<#
.SYNOPSIS
    Pins the stage-crossing readings to the demo fixtures (stage-crossings.md section 6).
.DESCRIPTION
    The comparer (StageCrossing.Judge) and every surface that reads it — the system graph,
    the findings stream, hosting, blast radius, the registry overview — are asserted against
    a running Census.Web on the Demo profile. The fixtures: PROD MyWeb calling the DEV
    YourWeb site (down), DEV YourWeb reading an untagged database on a prod-asserted box
    (up, derived), YourWeb's three tiers reading Shared_REF at `ref`, a stage outside the
    order (unordered; the prod one accepted in config/stage-crossings.demo.json), and
    OrderPortal's unclassified web apps (unjudged).

    Read-only. Start the app first:
      ASPNETCORE_ENVIRONMENT=Demo ASPNETCORE_URLS=http://localhost:5297 dotnet run --no-launch-profile
#>
param(
    [string]$BaseUrl = 'http://localhost:5297'
)
$ErrorActionPreference = 'Stop'

# Census requires Windows sign-in (census-on-apptrak.md §10): every call goes as you.
foreach ($c in 'Invoke-WebRequest', 'Invoke-RestMethod') {
    $PSDefaultParameterValues["$($c):UseDefaultCredentials"] = $true
    $PSDefaultParameterValues["$($c):AllowUnencryptedAuthentication"] = $true
}

$script:passed = 0
$script:failed = 0
function Assert-That {
    param([string]$Name, [bool]$Condition, $Actual = '')
    if ($Condition) { $script:passed++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else            { $script:failed++; Write-Host "  FAIL  $Name  [actual: $Actual]" -ForegroundColor Red }
}
function Get-Api { param([string]$Path) Invoke-RestMethod -Uri "$BaseUrl$Path" -Method Get }

Write-Host 'The comparer, through the MyWeb graph (observed)'
$myweb = Get-Api '/api/system-graph/MyWeb?grouping=observed'
$nodes = @{}; foreach ($n in $myweb.nodes) { $nodes[$n.id] = $n }
$edgeTo = { param($g, $src, $dst) $g.edges | Where-Object { $nodes[$_.sourceId].name -eq $src -and $nodes[$_.targetId].name -eq $dst } | Select-Object -First 1 }
Assert-That 'MyWeb fixture counts hold after the composer lift (11 members, 3 off-system + 3 Telemetry capsules)' (
    (@($myweb.nodes | Where-Object member).Count -eq 11) -and (@($myweb.nodes | Where-Object offSystem).Count -eq 6)) "$(@($myweb.nodes | Where-Object member).Count)/$(@($myweb.nodes | Where-Object offSystem).Count)"
Assert-That 'MyWeb has 13 edges, all confirmed (9 + the crossing fixture + 3 Telemetry calls)' (
    $myweb.edges.Count -eq 13 -and @($myweb.edges | Where-Object verdict -ne 'confirmed').Count -eq 0) $myweb.edges.Count
$down = & $edgeTo $myweb 'myweb.example.com/' 'yourweb.dev.example.com/'
Assert-That 'prod -> dev over http reads down, asserted' ($down.crossing -eq 'down' -and $down.crossingBasis -eq 'asserted') "$($down.crossing)/$($down.crossingBasis)"
Assert-That 'the down edge carries both stage sets' (($down.callerStages -join ',') -eq 'prod' -and ($down.targetStages -join ',') -eq 'dev') "$($down.callerStages)->$($down.targetStages)"
$same = & $edgeTo $myweb 'myweb.example.com/' 'MyDB'
Assert-That 'prod -> prod shares a stage: no crossing, judged' ($null -eq $same.crossing -and -not $same.unjudged) "$($same.crossing)"
$ref = & $edgeTo $myweb 'yourweb.val.example.com/' 'Shared_REF'
Assert-That 'val -> ref (a stage outside Census:StageOrder) reads unordered' ($ref.crossing -eq 'unordered') $ref.crossing
$accepted = & $edgeTo $myweb 'yourweb.example.com/' 'Shared_REF'
Assert-That 'the accepted crossing carries its acceptance (by, at, note)' ($accepted.crossing -eq 'unordered' -and $accepted.accepted.by -eq 'robert' -and $accepted.accepted.note) "$($accepted.accepted)"
Assert-That 'the toolbar count excludes the accepted one (3 crossings, 0 unjudged)' ($myweb.crossings -eq 3 -and $myweb.unjudgedEdges -eq 0) "$($myweb.crossings)/$($myweb.unjudgedEdges)"

Write-Host 'Derived basis and the canonical merge'
$yourweb = Get-Api '/api/system-graph/YourWeb?grouping=observed'
$ynodes = @{}; foreach ($n in $yourweb.nodes) { $ynodes[$n.id] = $n }
$up = $yourweb.edges | Where-Object { $ynodes[$_.sourceId].name -eq 'yourweb.dev.example.com/' -and $ynodes[$_.targetId].name -eq 'Gateway' } | Select-Object -First 1
Assert-That 'dev -> an untagged database on a prod-asserted box reads up, derived' ($up.crossing -eq 'up' -and $up.crossingBasis -eq 'derived') "$($up.crossing)/$($up.crossingBasis)"
Assert-That 'YourWeb counts 5 crossings (down, up, two unordered, val -> Telemetry dev)' ($yourweb.crossings -eq 5) $yourweb.crossings
$canonical = Get-Api '/api/system-graph/MyWeb?grouping=canonical'
$merged = $canonical.edges | Where-Object { $_.name -eq 'Services:Lookup:BaseUrl' } | Select-Object -First 1
Assert-That 'the canonical MyWeb node keeps the down reading on its merged edge' ($merged.crossing -eq 'down') $merged.crossing

Write-Host 'Unjudged, never silent'
$portal = Get-Api '/api/system-graph/OrderPortal?grouping=observed'
Assert-That 'OrderPortal: unclassified callers leave 3 edges unjudged, 0 crossings' ($portal.unjudgedEdges -eq 3 -and $portal.crossings -eq 0) "$($portal.unjudgedEdges)/$($portal.crossings)"

Write-Host 'Findings on the caller''s machine'
$findings = (Get-Api '/api/findings').findings | Where-Object kind -eq 'stage-crossing'
Assert-That 'five stage-crossing findings, medium' ($findings.Count -eq 5 -and @($findings | Where-Object severity -ne 'medium').Count -eq 0) $findings.Count
Assert-That 'the wound sits on PRODWEBBOX: "Calls a lower stage"' (@($findings | Where-Object { $_.machine -eq 'PRODWEBBOX' -and $_.title -like 'Calls a lower stage:*yourweb.dev.example.com/*' }).Count -eq 1) ($findings | Where-Object machine -eq 'PRODWEBBOX' | ForEach-Object title)
Assert-That 'the derived one says so in its detail' (@($findings | Where-Object { $_.machine -eq 'DEVWEBBOX' -and $_.detail -like '*judged on SQL02''s effective stage, derived*' }).Count -eq 1) ''
Assert-That 'the accepted crossing is not a finding' (@($findings | Where-Object { $_.title -like '*yourweb.example.com/ (prod)*' }).Count -eq 0) ''

Write-Host 'Hosting and blast radius carry the word'
$hosting = Get-Api '/api/hosting'
$lookup = $hosting.dependencies | Where-Object target -like 'https://yourweb.dev.example.com/*' | Select-Object -First 1
Assert-That 'Hosting: the lookup target says "stage crossing from 1 caller — down"' ($lookup.corroborationDetail -like '*stage crossing from 1 caller*down (prod*dev)*') $lookup.corroborationDetail
$blast = Get-Api '/api/blast-radius/DEVWEBBOX'
$dependents = @($blast.deployments | ForEach-Object { $_.dependents }) + @($blast.unclassifiedDependents)
$edge = $dependents | ForEach-Object { $_.edges } | Where-Object name -eq 'Services:Lookup:BaseUrl' | Select-Object -First 1
Assert-That 'Blast radius of DEVWEBBOX: the PROD caller''s edge says "stage crossing, down"' ($edge.detail -like '*stage crossing, down (prod*dev)*') $edge.detail

Write-Host 'The registry overview'
$overview = Get-Api '/api/systems/overview'
$ov = @{}; foreach ($r in $overview) { $ov[$r.name] = $r }
Assert-That 'MyWeb 3 crossings / YourWeb 5 / OrderPortal 3 unjudged' ($ov['MyWeb'].crossings -eq 3 -and $ov['YourWeb'].crossings -eq 5 -and $ov['OrderPortal'].unjudgedEdges -eq 3) "$($ov['MyWeb'].crossings)/$($ov['YourWeb'].crossings)/$($ov['OrderPortal'].unjudgedEdges)"

Write-Host 'The cross-cutting fold (cross-cutting-systems.md)'
$capsules = @($myweb.nodes | Where-Object service)
Assert-That 'MyWeb folds Telemetry into three capsules (dev, val, prod), one endpoint each' ($capsules.Count -eq 3 -and @($capsules | Where-Object { $_.variants.Count -eq 1 }).Count -eq 3 -and (($capsules | ForEach-Object { $_.serviceStages -join '' } | Sort-Object) -join ',') -eq 'dev,prod,val') "$($capsules.Count): $(($capsules | ForEach-Object { $_.serviceStages -join '' }) -join ',')"
Assert-That '  the graph names the service and says it is folded' ($myweb.folded -and $myweb.services.Count -eq 3 -and $myweb.services[0].system -eq 'Telemetry') "$($myweb.services.Count)"
$unfolded = Get-Api '/api/system-graph/MyWeb?grouping=observed&fold=false'
Assert-That '  fold=false draws the three Telemetry sites themselves, no capsule' (@($unfolded.nodes | Where-Object service).Count -eq 0 -and @($unfolded.nodes | Where-Object { $_.name -like 'telemetry*' }).Count -eq 3 -and -not $unfolded.folded) "$(@($unfolded.nodes | Where-Object { $_.name -like 'telemetry*' }).Count)"
$telemetry = Get-Api '/api/system-graph/Telemetry?grouping=observed'
Assert-That '  Telemetry''s own graph never folds: three members, no capsule' (@($telemetry.nodes | Where-Object member).Count -eq 3 -and @($telemetry.nodes | Where-Object service).Count -eq 0) "$(@($telemetry.nodes | Where-Object member).Count)"
$yw = Get-Api '/api/system-graph/YourWeb?grouping=observed'
$ywNodes = @{}; foreach ($n in $yw.nodes) { $ywNodes[$n.id] = $n }
$toDev = $yw.edges | Where-Object { $ywNodes[$_.sourceId].name -eq 'yourweb.val.example.com/' -and $ywNodes[$_.targetId].service -and ($ywNodes[$_.targetId].serviceStages -join '') -eq 'dev' } | Select-Object -First 1
Assert-That '  yourweb.val -> the Telemetry dev capsule keeps its reading: down' ($toDev.crossing -eq 'down') "$($toDev.crossing)"
Assert-That '  the registry overview: Telemetry is cross-cutting, called by 2 systems' ($ov['Telemetry'].crossCutting -and $ov['Telemetry'].calledBy -eq 2) "$($ov['Telemetry'].crossCutting)/$($ov['Telemetry'].calledBy)"

Write-Host ''
Write-Host "$($script:passed) passed, $($script:failed) failed" -ForegroundColor ($(if ($script:failed) { 'Red' } else { 'Green' }))
if ($script:failed) { exit 1 }
