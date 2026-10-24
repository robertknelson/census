<#
    Checks a copy of the Gatehouse package against its MANIFEST.sha256 (Gatehouse.Web/PORTING.md): every listed file is
    there with the same SHA-256, and nothing unlisted came along (build output, bin/ and obj/, is not counted). Run it
    from the package's root after the copy.

    Usage: .\Test-GatehousePackage.ps1 [-Root <the package folder>]
#>
param([string]$Root = $PSScriptRoot)
$ErrorActionPreference = 'Stop'

$manifest = Join-Path $Root 'MANIFEST.sha256'
if (-not (Test-Path $manifest)) { throw "No MANIFEST.sha256 in $Root." }

$listed = @{}
foreach ($line in Get-Content $manifest) {
    if ($line -match '^([0-9a-f]{64})  (.+)$') { $listed[$Matches[2]] = $Matches[1] }
}

$missing = @(); $changed = @()
foreach ($path in $listed.Keys) {
    $file = Join-Path $Root $path
    if (-not (Test-Path -LiteralPath $file)) { $missing += $path; continue }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $listed[$path]) { $changed += $path }
}
$extra = @(Get-ChildItem $Root -Recurse -File |
    ForEach-Object { $_.FullName.Substring($Root.TrimEnd('\', '/').Length + 1).Replace('\', '/') } |
    Where-Object { $_ -ne 'MANIFEST.sha256' -and $_ -notmatch '(^|/)(bin|obj)/' -and -not $listed.ContainsKey($_) })

foreach ($p in $missing) { Write-Host "  MISSING  $p" -ForegroundColor Red }
foreach ($p in $changed) { Write-Host "  CHANGED  $p" -ForegroundColor Red }
foreach ($p in $extra) { Write-Host "  EXTRA    $p" -ForegroundColor Yellow }
$ok = $missing.Count -eq 0 -and $changed.Count -eq 0
Write-Host ("{0} files listed; {1} missing, {2} changed, {3} extra." -f $listed.Count, $missing.Count, $changed.Count, $extra.Count) -ForegroundColor ($(if ($ok) { 'Green' } else { 'Red' }))
if (-not $ok) { exit 1 }
