<#
    Builds the Gatehouse package (Gatehouse.Web/PORTING.md): the app, its tests, the solution and the docs they cite, as
    one zip with a SHA-256 manifest, to be carried by hand to another network. Leaves out build output and local
    settings, and refuses to build if this machine's user, computer or domain name appears in any file.

    Usage: .\New-GatehousePackage.ps1 [-OutDir <folder>]     (default: <repo>\out)
#>
param([string]$OutDir)
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $OutDir) { $OutDir = Join-Path $repo 'out' }
$name = "gatehouse-package-$(Get-Date -Format 'yyyy-MM-dd')"
$stage = Join-Path ([System.IO.Path]::GetTempPath()) $name
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force -Confirm:$false }
New-Item -ItemType Directory -Force $stage | Out-Null

function Copy-Tree([string]$from, [string]$to) {
    $source = Join-Path $repo $from
    Get-ChildItem $source -Recurse -File | Where-Object {
        $relative = $_.FullName.Substring($source.Length + 1)
        $relative -notmatch '^(bin|obj)\\' -and $relative -notmatch '\\(bin|obj)\\' -and
        $_.Name -ne 'appsettings.Local.json' -and $_.Extension -ne '.user' -and $_.Name -notmatch 'copilot'
    } | ForEach-Object {
        $target = Join-Path (Join-Path $stage $to) $_.FullName.Substring($source.Length + 1)
        New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
        Copy-Item $_.FullName $target
    }
}

Copy-Tree 'Gatehouse.Web' 'Gatehouse.Web'
Copy-Tree 'Gatehouse.Tests' 'Gatehouse.Tests'
Copy-Item (Join-Path $repo 'Gatehouse.slnx') $stage
Copy-Item (Join-Path $repo 'Gatehouse.Web\PORTING.md') $stage
Copy-Item (Join-Path $repo 'Gatehouse.Web\setup\Test-GatehousePackage.ps1') $stage
New-Item -ItemType Directory -Force (Join-Path $stage 'docs') | Out-Null
foreach ($doc in '.docs\features\gatehouse.md', '.docs\features\log-explorer-and-trace.md', '.docs\features\usage.md', '.docs\go-live-log-explorer.md', '.docs\features\app-event.md') {
    Copy-Item (Join-Path $repo $doc) (Join-Path $stage 'docs')
}

# Nothing that names this machine or its account leaves it.
$names = @($env:USERNAME, $env:COMPUTERNAME, $env:USERDOMAIN) | Where-Object { $_ } | Select-Object -Unique
$found = Get-ChildItem $stage -Recurse -File | Select-String -Pattern ($names | ForEach-Object { "\b$([regex]::Escape($_))\b" }) -List
if ($found) {
    $found | ForEach-Object { Write-Host "  names this machine: $($_.Path.Substring($stage.Length + 1)):$($_.LineNumber)" -ForegroundColor Red }
    throw 'The package would carry this machine''s user, computer or domain name; nothing was written.'
}

$lines = Get-ChildItem $stage -Recurse -File | Sort-Object FullName | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.FullName.Substring($stage.Length + 1).Replace('\', '/')
}
[System.IO.File]::WriteAllLines((Join-Path $stage 'MANIFEST.sha256'), [string[]]$lines)

New-Item -ItemType Directory -Force $OutDir | Out-Null
$zip = Join-Path $OutDir "$name.zip"
if (Test-Path $zip) { Remove-Item $zip -Force -Confirm:$false }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Remove-Item $stage -Recurse -Force -Confirm:$false
Write-Host "$($lines.Count) files, $zip ($([math]::Round((Get-Item $zip).Length / 1KB)) KB)" -ForegroundColor Green
