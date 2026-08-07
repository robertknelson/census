<#
    Exercises the pared IIS collector (census-collector.md 8.6) against a synthetic
    applicationHost.config tree. The dev box has no IIS, so this is how the parsing gets
    verified. Functions are lifted out of Invoke-Census.ps1 by AST so the production script
    is not modified for testability.
#>
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
# The fixture tree is built outside the repo so a test run never leaves artefacts behind.
$fx   = Join-Path ([System.IO.Path]::GetTempPath()) 'census-iis-fixture'

if (Test-Path $fx) { Remove-Item $fx -Recurse -Force }
foreach ($dir in @('config', 'sites\wwwroot', 'sites\api', 'sites\legacy', 'logs\W3SVC1')) {
    New-Item -ItemType Directory -Path (Join-Path $fx $dir) -Force | Out-Null
}

# --- fixture: applicationHost.config -----------------------------------------------------
$appHost = @'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.applicationHost>
    <log centralLogFileMode="Site" />
    <applicationPools>
      <add name="DefaultAppPool">
        <processModel />
      </add>
      <add name="LegacyPool" managedRuntimeVersion="v2.0" managedPipelineMode="Classic">
        <processModel identityType="SpecificUser" userName="CORP\svc-legacy" password="p@ssw0rd-legacy" />
      </add>
      <add name="CorePool" managedRuntimeVersion="" managedPipelineMode="Integrated">
        <processModel identityType="ApplicationPoolIdentity" />
      </add>
      <applicationPoolDefaults managedRuntimeVersion="v4.0" managedPipelineMode="Integrated">
        <processModel identityType="ApplicationPoolIdentity" />
      </applicationPoolDefaults>
    </applicationPools>
    <sites>
      <site name="Default Web Site" id="1" serverAutoStart="true">
        <application path="/" applicationPool="DefaultAppPool">
          <virtualDirectory path="/" physicalPath="__FX__\sites\wwwroot" />
        </application>
        <application path="/api" applicationPool="CorePool" enabledProtocols="http">
          <virtualDirectory path="/" physicalPath="__FX__\sites\api" />
          <virtualDirectory path="/content" physicalPath="\\fs01\share\content" userName="CORP\svc-content" logonMethod="ClearText" />
        </application>
        <bindings>
          <binding protocol="http" bindingInformation="*:80:" />
          <binding protocol="https" bindingInformation="*:443:portal.example.com" sslFlags="1" certificateHash="AABBCCDD11223344" certificateStoreName="My" />
          <binding protocol="net.tcp" bindingInformation="808:*" />
        </bindings>
        <logFile directory="__FX__\logs" logFormat="W3C" period="Daily" enabled="true" />
      </site>
      <site name="legacy-site" id="2" serverAutoStart="false">
        <application path="/" applicationPool="LegacyPool">
          <virtualDirectory path="/" physicalPath="__FX__\sites\legacy" />
        </application>
        <bindings>
          <binding protocol="http" bindingInformation="10.0.0.5:8080:legacy.corp.local" />
        </bindings>
      </site>
      <siteDefaults>
        <logFile directory="%SystemDrive%\inetpub\logs\LogFiles" logFormat="W3C" period="Daily" />
      </siteDefaults>
    </sites>
  </system.applicationHost>
  <system.webServer>
    <security>
      <authentication>
        <anonymousAuthentication enabled="true" userName="IUSR" />
        <windowsAuthentication enabled="false" />
      </authentication>
    </security>
  </system.webServer>
  <location path="Default Web Site/api">
    <system.webServer>
      <security>
        <authentication>
          <windowsAuthentication enabled="true" />
          <anonymousAuthentication enabled="false" />
        </authentication>
      </security>
    </system.webServer>
  </location>
</configuration>
'@
$appHost = $appHost.Replace('__FX__', $fx)
Set-Content -Path (Join-Path $fx 'config\applicationHost.config') -Value $appHost -Encoding UTF8

# --- fixture: the .NET Core application --------------------------------------------------
Set-Content -Path (Join-Path $fx 'sites\api\web.config') -Encoding UTF8 -Value @'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <aspNetCore processPath="dotnet" arguments=".\Api.dll" hostingModel="inprocess">
      <environmentVariables>
        <environmentVariable name="ASPNETCORE_ENVIRONMENT" value="Development" />
      </environmentVariables>
    </aspNetCore>
  </system.webServer>
</configuration>
'@

Set-Content -Path (Join-Path $fx 'sites\api\appsettings.json') -Encoding UTF8 -Value @'
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=.;Database=ApiDb;Integrated Security=SSPI",
    "Reporting": "Server=tcp:SQLPROD07.corp.local,1433;Initial Catalog=Rpt;User ID=svc_rpt;Password=hunter2;Encrypt=True"
  },
  "Services": {
    "Billing": { "BaseUrl": "https://billing.corp.local/api/v1" },
    "Legacy":  { "Feed": "https://feeduser:s3cret@legacy.corp.local/feed?api_key=abc123" }
  },
  "Schema": "http://schemas.xmlsoap.org/soap/envelope/",
  "Logging": { "LogLevel": { "Default": "Information" } }
}
'@

Set-Content -Path (Join-Path $fx 'sites\api\Api.runtimeconfig.json') -Value '{}' -Encoding UTF8

# --- fixture: the .NET Framework application ---------------------------------------------
Set-Content -Path (Join-Path $fx 'sites\legacy\web.config') -Encoding UTF8 -Value @'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <connectionStrings>
    <add name="LegacyDb" connectionString="Data Source=(local)\SQLEXPRESS;Initial Catalog=LegacyDb;Integrated Security=True" providerName="System.Data.SqlClient" />
    <add name="FileDb" connectionString="Data Source=C:\data\local.mdf;Integrated Security=True" providerName="System.Data.SqlClient" />
  </connectionStrings>
  <appSettings>
    <add key="PaymentGatewayUrl" value="https://payments.vendor.example.com/v2/charge" />
    <add key="SoapNs" value="http://schemas.xmlsoap.org/wsdl/" />
    <add key="Timeout" value="30" />
  </appSettings>
  <system.serviceModel>
    <client>
      <endpoint name="InventorySvc" address="http://inventory.corp.local:8081/Inventory.svc" contract="IInventory" />
    </client>
  </system.serviceModel>
  <system.webServer>
    <security>
      <authentication>
        <windowsAuthentication enabled="true" />
      </authentication>
    </security>
  </system.webServer>
</configuration>
'@

# wwwroot deliberately has no web.config - a static site is 'not-present', not a failure.

# --- fixture: log files ------------------------------------------------------------------
$logDir = Join-Path $fx 'logs\W3SVC1'
$now = Get-Date
foreach ($entry in @(@{ n = 'u_ex260805.log'; age = 3; size = 1024 },
                     @{ n = 'u_ex260806.log'; age = 2; size = 2048 },
                     @{ n = 'u_ex260807.log'; age = 0; size = 4096 })) {
    $path = Join-Path $logDir $entry.n
    [System.IO.File]::WriteAllBytes($path, (New-Object byte[] $entry.size))
    (Get-Item $path).LastWriteTime = $now.AddDays(-$entry.age)
}

# --- load the collector's functions ------------------------------------------------------
$scriptPath = Join-Path $repo 'Invoke-Census.ps1'
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$null, [ref]$null)
$functions = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
foreach ($function in $functions) { Invoke-Expression $function.Extent.Text }
Write-Host "Loaded $($functions.Count) functions from Invoke-Census.ps1`n"

# --- run ---------------------------------------------------------------------------------
$inetStp = [PSCustomObject]@{ VersionString = '10.0.26100.1'; MajorVersion = 10; PathWWWRoot = '%SystemDrive%\inetpub\wwwroot' }
$result  = Get-CensusIisFromConfig -ConfigPath (Join-Path $fx 'config\applicationHost.config') -InetStp $inetStp -LogEnumerationCap 5000
$json    = $result | ConvertTo-Json -Depth 10

# --- assertions --------------------------------------------------------------------------
$script:passed = 0
$script:failed = 0
function Assert-That {
    param([string]$Name, [bool]$Condition, $Actual = '')
    if ($Condition) { $script:passed++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else            { $script:failed++; Write-Host "  FAIL  $Name  [actual: $Actual]" -ForegroundColor Red }
}

$pools   = @{}; foreach ($p in $result.appPools) { $pools[$p.name] = $p }
$apps    = @{}; foreach ($a in $result.applications) { $apps["$($a.siteName)$($a.path)"] = $a }
$sites   = @{}; foreach ($s in $result.sites) { $sites[$s.name] = $s }
$api     = $apps['Default Web Site/api']
$root    = $apps['Default Web Site/']
$legacy  = $apps['legacy-site/']

Write-Host 'App pools - defaults inheritance' -ForegroundColor Cyan
Assert-That 'DefaultAppPool inherits v4.0 from applicationPoolDefaults' ($pools['DefaultAppPool'].managedRuntimeVersion -eq 'v4.0') $pools['DefaultAppPool'].managedRuntimeVersion
Assert-That 'DefaultAppPool records the inheritance source' ($pools['DefaultAppPool'].managedRuntimeVersionSource -eq 'applicationPoolDefaults') $pools['DefaultAppPool'].managedRuntimeVersionSource
Assert-That 'CorePool keeps explicit empty runtime (No Managed Code)' ($pools['CorePool'].managedRuntimeVersion -eq '' -and $pools['CorePool'].managedRuntimeVersionSource -eq 'pool') "'$($pools['CorePool'].managedRuntimeVersion)'/$($pools['CorePool'].managedRuntimeVersionSource)"
Assert-That 'LegacyPool is v2.0 Classic' ($pools['LegacyPool'].managedRuntimeVersion -eq 'v2.0' -and $pools['LegacyPool'].managedPipelineMode -eq 'Classic') "$($pools['LegacyPool'].managedRuntimeVersion)/$($pools['LegacyPool'].managedPipelineMode)"
Assert-That 'LegacyPool SpecificUser identity captured' ($pools['LegacyPool'].identityType -eq 'SpecificUser' -and $pools['LegacyPool'].userName -eq 'CORP\svc-legacy') "$($pools['LegacyPool'].identityType)/$($pools['LegacyPool'].userName)"

Write-Host "`nBindings - protocol gating and parsing" -ForegroundColor Cyan
$httpsBinding = $sites['Default Web Site'].bindings | Where-Object { $_.protocol -eq 'https' }
$netTcpBinding = $sites['Default Web Site'].bindings | Where-Object { $_.protocol -eq 'net.tcp' }
$legacyBinding = $sites['legacy-site'].bindings[0]
Assert-That 'https binding parses ip/port/hostHeader' ($httpsBinding.ip -eq '*' -and $httpsBinding.port -eq 443 -and $httpsBinding.hostHeader -eq 'portal.example.com') "$($httpsBinding.ip)/$($httpsBinding.port)/$($httpsBinding.hostHeader)"
Assert-That 'https certificateHash still surfaced for the cert join' ($httpsBinding.certificateHash -eq 'AABBCCDD11223344') $httpsBinding.certificateHash
Assert-That 'net.tcp binding is NOT parsed' ($netTcpBinding.parsed -eq $false -and $null -eq $netTcpBinding.port) "parsed=$($netTcpBinding.parsed) port=$($netTcpBinding.port)"
Assert-That 'ip-specific binding parses' ($legacyBinding.ip -eq '10.0.0.5' -and $legacyBinding.port -eq 8080) "$($legacyBinding.ip)/$($legacyBinding.port)"

Write-Host "`nSites and applications" -ForegroundColor Cyan
Assert-That 'three applications emitted, including both implicit roots' ($result.applications.Count -eq 3) $result.applications.Count
Assert-That 'site physical path read from root app root vdir' ($sites['Default Web Site'].physicalPath.expanded -eq (Join-Path $fx 'sites\wwwroot')) $sites['Default Web Site'].physicalPath.expanded
Assert-That 'serverAutoStart captured on legacy-site' ($sites['legacy-site'].serverAutoStart -eq 'false') $sites['legacy-site'].serverAutoStart
Assert-That 'site <site> carries no state attribute (nothing invented)' (-not $sites['Default Web Site'].ContainsKey('state')) ($sites['Default Web Site'].Keys -join ',')
Assert-That 'UNC virtual directory captured on /api' (@($api.virtualDirectories | Where-Object { $_.physicalPath.raw -eq '\\fs01\share\content' }).Count -eq 1) ($api.virtualDirectories.Count)
Assert-That 'vdir connect-as userName captured' ((@($api.virtualDirectories | Where-Object { $_.path -eq '/content' })[0]).userName -eq 'CORP\svc-content') ''
Assert-That 'pool facts denormalized onto the application row' ($api.poolManagedRuntimeVersion -eq '' -and $api.poolIdentityType -eq 'ApplicationPoolIdentity') "'$($api.poolManagedRuntimeVersion)'/$($api.poolIdentityType)"

Write-Host "`nAuthentication - merge order and source" -ForegroundColor Cyan
Assert-That '/api windows auth comes from <location>, enabled' ($api.auth.windowsAuthentication.enabled -eq $true -and $api.auth.windowsAuthentication.source -eq 'location') "$($api.auth.windowsAuthentication.enabled)/$($api.auth.windowsAuthentication.source)"
Assert-That '/api anonymous overridden to false by <location>' ($api.auth.anonymousAuthentication.enabled -eq $false -and $api.auth.anonymousAuthentication.source -eq 'location') "$($api.auth.anonymousAuthentication.enabled)/$($api.auth.anonymousAuthentication.source)"
Assert-That 'root app falls back to server defaults' ($root.auth.anonymousAuthentication.enabled -eq $true -and $root.auth.anonymousAuthentication.source -eq 'serverDefault') "$($root.auth.anonymousAuthentication.enabled)/$($root.auth.anonymousAuthentication.source)"
Assert-That 'legacy windows auth comes from its own web.config' ($legacy.auth.windowsAuthentication.enabled -eq $true -and $legacy.auth.windowsAuthentication.source -eq 'webConfig') "$($legacy.auth.windowsAuthentication.enabled)/$($legacy.auth.windowsAuthentication.source)"

Write-Host "`nRuntime marker" -ForegroundColor Cyan
Assert-That '/api aspNetCore hostingModel captured' ($api.runtime.aspNetCore.hostingModel -eq 'inprocess') $api.runtime.aspNetCore.hostingModel
Assert-That '/api ASPNETCORE_ENVIRONMENT surfaced as a stage signal' ($api.runtime.aspNetCore.environmentVariables['ASPNETCORE_ENVIRONMENT'] -eq 'Development') ''
Assert-That '/api has appsettings.json AND a runtimeconfig.json' ($api.runtime.hasAppSettingsJson -and $api.runtime.hasRuntimeConfigJson) "$($api.runtime.hasAppSettingsJson)/$($api.runtime.hasRuntimeConfigJson)"
Assert-That 'legacy app has no aspNetCore element' ($null -eq $legacy.runtime.aspNetCore) $legacy.runtime.aspNetCore
Assert-That 'legacy app pool runtime is v2.0' ($legacy.runtime.poolManagedRuntimeVersion -eq 'v2.0') $legacy.runtime.poolManagedRuntimeVersion

Write-Host "`nError isolation" -ForegroundColor Cyan
Assert-That 'static site missing web.config is not-present, not failed' ($root.configFiles.webConfig.status -eq 'not-present' -and $root.status -eq 'ok') "$($root.configFiles.webConfig.status)/$($root.status)"
Assert-That 'category did not fail because one app had no web.config' (-not $result.ContainsKey('status')) ''

Write-Host "`nDependency edges - databases" -ForegroundColor Cyan
$dbEdges = @($result.dependencies | Where-Object { $_.kind -eq 'database' })
$defaultConn = $dbEdges | Where-Object { $_.name -eq 'DefaultConnection' }
$reporting   = $dbEdges | Where-Object { $_.name -eq 'Reporting' }
$legacyDb    = $dbEdges | Where-Object { $_.name -eq 'LegacyDb' }
$fileDb      = @($result.dependencies | Where-Object { $_.name -eq 'FileDb' })
Assert-That 'DefaultConnection is NOT filtered out' ($null -ne $defaultConn) ''
Assert-That "'Server=.' normalized to this machine and flagged local" ($defaultConn.host -eq $env:COMPUTERNAME -and $defaultConn.isLocal -eq $true) "$($defaultConn.host)/$($defaultConn.isLocal)"
Assert-That 'tcp: prefix, host and port split correctly' ($reporting.host -eq 'SQLPROD07.corp.local' -and $reporting.port -eq 1433 -and $reporting.protocol -eq 'tcp') "$($reporting.host)/$($reporting.port)/$($reporting.protocol)"
Assert-That 'sql auth detected and secretsPresent set' ($reporting.authMode -eq 'sql' -and $reporting.secretsPresent -eq $true) "$($reporting.authMode)/$($reporting.secretsPresent)"
Assert-That 'integrated auth detected' ($defaultConn.authMode -eq 'integrated') $defaultConn.authMode
Assert-That "'(local)\SQLEXPRESS' splits host and instance, flagged local" ($legacyDb.isLocal -eq $true -and $legacyDb.instance -eq 'SQLEXPRESS') "$($legacyDb.host)/$($legacyDb.instance)/$($legacyDb.isLocal)"
Assert-That '.mdf data source classified as a file edge, not a server' ($fileDb.Count -eq 1 -and $fileDb[0].kind -eq 'file') "$($fileDb.Count)/$($fileDb[0].kind)"
Assert-That 'edges carry site and app path' ($reporting.siteName -eq 'Default Web Site' -and $reporting.appPath -eq '/api') "$($reporting.siteName)$($reporting.appPath)"

Write-Host "`nDependency edges - http" -ForegroundColor Cyan
$httpEdges = @($result.dependencies | Where-Object { $_.kind -eq 'http' })
$billing   = $httpEdges | Where-Object { $_.host -eq 'billing.corp.local' }
$feed      = $httpEdges | Where-Object { $_.host -eq 'legacy.corp.local' }
$gateway   = $httpEdges | Where-Object { $_.host -eq 'payments.vendor.example.com' }
$inventory = $httpEdges | Where-Object { $_.host -eq 'inventory.corp.local' }
Assert-That 'appsettings.json nested URL captured with its key path' ($billing.name -eq 'Services:Billing:BaseUrl') $billing.name
Assert-That 'web.config appSettings URL captured' ($gateway.name -eq 'PaymentGatewayUrl') $gateway.name
Assert-That 'WCF client endpoint captured with port' ($inventory.name -eq 'InventorySvc' -and $inventory.port -eq 8081) "$($inventory.name)/$($inventory.port)"
Assert-That 'schema/namespace URIs are filtered out' (@($httpEdges | Where-Object { $_.host -like '*xmlsoap*' }).Count -eq 0) ''
Assert-That 'non-URL appSettings values ignored' (@($httpEdges | Where-Object { $_.name -eq 'Timeout' }).Count -eq 0) ''
Assert-That 'credentials and query flagged on the feed URL' ($feed.hadCredentials -eq $true -and $feed.hadQuery -eq $true) "$($feed.hadCredentials)/$($feed.hadQuery)"

Write-Host "`nRedaction - nothing secret reaches the payload" -ForegroundColor Cyan
Assert-That 'app pool password never emitted' (-not $json.Contains('p@ssw0rd-legacy')) ''
Assert-That 'connection string password never emitted' (-not $json.Contains('hunter2')) ''
Assert-That 'URL userinfo never emitted' (-not $json.Contains('s3cret') -and -not $json.Contains('feeduser')) ''
Assert-That 'URL query string never emitted' (-not $json.Contains('api_key') -and -not $json.Contains('abc123')) ''
Assert-That 'raw connection string never emitted' (-not $json.Contains('Integrated Security=SSPI')) ''

Write-Host "`nLog directories" -ForegroundColor Cyan
$log1 = $sites['Default Web Site'].logFile
$log2 = $sites['legacy-site'].logFile
Assert-That 'site log dir enumerated' ($log1.stats.exists -eq $true -and $log1.stats.fileCount -eq 3) "exists=$($log1.stats.exists) count=$($log1.stats.fileCount)"
Assert-That 'total bytes summed' ($log1.stats.totalBytes -eq 7168) $log1.stats.totalBytes
Assert-That 'last24hBytes counts only the recent file' ($log1.stats.last24hBytes -eq 4096) $log1.stats.last24hBytes
Assert-That 'oldest and newest recorded' ($null -ne $log1.stats.oldestUtc -and $null -ne $log1.stats.newestUtc) ''
Assert-That 'not truncated below the cap' ($log1.stats.truncated -eq $false -and $log1.stats.enumerationCap -eq 5000) "$($log1.stats.truncated)/$($log1.stats.enumerationCap)"
Assert-That 'site without logFile falls back to siteDefaults' ($log2.directorySource -eq 'siteDefaults') $log2.directorySource
Assert-That '%SystemDrive% expanded in the fallback directory' ($log2.directory.expanded -eq (Join-Path $env:SystemDrive 'inetpub\logs\LogFiles') -and $log2.directory.expandable) $log2.directory.expanded
Assert-That 'absent log directory reports exists=false, not an error' ($log2.stats.enumerationStatus -eq 'ok' -and $log2.stats.exists -eq $false) "$($log2.stats.enumerationStatus)/$($log2.stats.exists)"

Write-Host "`nServer facts" -ForegroundColor Cyan
Assert-That 'applicationHost.config hash and mtime captured' ($result.server.configSha256.Length -eq 64 -and $null -ne $result.server.configLastWriteUtc) $result.server.configSha256
Assert-That 'IIS version carried through' ($result.server.versionString -eq '10.0.26100.1') $result.server.versionString

Write-Host "`nSerialisation" -ForegroundColor Cyan
Assert-That 'payload survives ConvertTo-Json -Depth 10 without truncation' (-not $json.Contains('System.Object[]') -and -not $json.Contains('System.Collections.Hashtable')) ''

Write-Host "`n$('-' * 60)"
Write-Host "passed: $script:passed   failed: $script:failed" -ForegroundColor $(if ($script:failed) { 'Red' } else { 'Green' })
if ($script:failed) { exit 1 }
