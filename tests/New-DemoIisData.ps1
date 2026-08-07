<#
    Regenerates the `iis` category in output-demo/ to the v2 payload shape
    (census-collector.md 8.6). The demo tree is fabricated and stays fabricated
    (census-web.md 9.6) - no real IIS run is reachable from this environment.

    Every branch the dossier has to render is covered deliberately; see the coverage
    checklist in census-web.md 9.6.
#>
$ErrorActionPreference = 'Stop'
$root = Join-Path (Split-Path -Parent $PSScriptRoot) 'output-demo'

# Edge hashes must be deterministic, or every regeneration rewrites the demo tree with new
# values and produces a diff that is pure noise. Derived from the edge's own identity.
function FakeSha {
    param([string]$Seed)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Seed)
        return [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
    }
    finally { $sha.Dispose() }
}

# [string]$null coerces to '', and '' is not a valid DateTimeOffset to System.Text.Json.
# Nullable fields are therefore untyped and normalised back to $null here.
function Nz {
    param($Value)
    if ([string]::IsNullOrEmpty($Value)) { return $null }
    return $Value
}

function Path2 {
    param([string]$Raw, [string]$Expanded, [bool]$Expandable = $true)
    [ordered]@{ raw = $Raw; expanded = $(if ($Expanded) { $Expanded } else { $Raw }); expandable = $Expandable }
}

function LogFile {
    param([string]$Directory, [string]$Enabled = 'true', [int]$Files = 0, [long]$Total = 0,
          $Oldest, $Newest, [long]$Last24h = 0, [bool]$Exists = $true)
    [ordered]@{
        enabled            = $Enabled
        directory          = Path2 '%SystemDrive%\inetpub\logs\LogFiles' $Directory
        directorySource    = 'siteDefaults'
        logFormat          = 'W3C'
        period             = 'Daily'
        truncateSize       = $null
        logTargetW3C       = 'File'
        centralLogFileMode = 'Site'
        stats              = [ordered]@{
            enumerationStatus = 'ok'
            resolvedDirectory = $Directory
            exists            = $Exists
            fileCount         = $Files
            totalBytes        = $Total
            oldestUtc         = Nz $Oldest
            newestUtc         = Nz $Newest
            last24hBytes      = $Last24h
            truncated         = $false
            enumerationCap    = 5000
        }
    }
}

function Auth {
    param([bool]$AnonEnabled, [string]$AnonSource, [bool]$WinEnabled, [string]$WinSource)
    [ordered]@{
        anonymousAuthentication = [ordered]@{ enabled = $AnonEnabled; userName = 'IUSR'; source = $AnonSource }
        windowsAuthentication   = [ordered]@{ enabled = $WinEnabled; userName = $null;  source = $WinSource }
    }
}

function DbEdge {
    param([string]$Site, [string]$App, [string]$Source, [string]$Name, [string]$DbHost, [string]$Instance,
          $Port, [string]$Database, [string]$AuthMode, [bool]$IsLocal = $false, [bool]$Secrets = $false)
    # A NEW variable, not $Instance: a [string] parameter keeps its type constraint for every
    # later assignment in the scope, so `$Instance = Nz $Instance` would coerce the null
    # straight back to an empty string.
    $instanceValue = Nz $Instance
    [ordered]@{
        siteName = $Site; appPath = $App; sourceFile = $Source; kind = 'database'; name = $Name
        host = $DbHost; rawHost = $DbHost; isLocal = $IsLocal; instance = $instanceValue; port = $Port
        protocol = $null; filePath = $null; database = $Database; authMode = $AuthMode
        provider = 'System.Data.SqlClient'; encrypt = $null; trustServerCertificate = $null
        secretsPresent = $Secrets; parseStatus = 'ok'
        sha256 = FakeSha "$Site|$App|$Source|$Name|$DbHost|$Instance|$Port|$Database"
    }
}

function HttpEdge {
    param([string]$Site, [string]$App, [string]$Source, [string]$Name, [string]$Scheme, [string]$UrlHost,
          [int]$Port, [string]$UrlPath, [bool]$Creds = $false, [bool]$Query = $false, [bool]$IsLocal = $false)
    [ordered]@{
        siteName = $Site; appPath = $App; sourceFile = $Source; kind = 'http'; name = $Name
        scheme = $Scheme; host = $UrlHost; rawHost = $UrlHost; isLocal = $IsLocal; port = $Port; path = $UrlPath
        hadCredentials = $Creds; hadQuery = $Query
        sha256 = FakeSha "$Site|$App|$Source|$Name|$Scheme|$UrlHost|$Port|$UrlPath"
    }
}

function Alias {
    param([string]$Kind, [string]$Value, [string]$Source)
    [ordered]@{ kind = $Kind; value = $Value; source = $Source }
}

function AliasCategory {
    param($Aliases, $Sources)
    [PSCustomObject]([ordered]@{
        status     = 'ok'
        data       = [ordered]@{ aliases = $Aliases; sources = $Sources }
        durationMs = 41
    })
}

function Pool {
    param([string]$Name, [string]$Runtime, [string]$RuntimeSource, [string]$Pipeline, [string]$Identity, $User)
    [ordered]@{
        name = $Name; managedRuntimeVersion = $Runtime; managedRuntimeVersionSource = $RuntimeSource
        managedPipelineMode = $Pipeline; identityType = $Identity; identityTypeSource = 'pool'; userName = (Nz $User)
    }
}

function Binding {
    param([string]$Protocol, [string]$Info, [string]$Ip, $Port, [string]$HostHeader, $SslFlags, $Hash)
    [ordered]@{
        protocol = $Protocol; bindingInformation = $Info; ip = $Ip; port = $Port
        hostHeader = $HostHeader; parsed = $true; sslFlags = (Nz $SslFlags)
        certificateHash = (Nz $Hash); certificateStoreName = $(if ($Hash) { 'My' } else { $null })
    }
}

function Server {
    param([string]$Version, [string]$Written, [string]$Sha)
    [ordered]@{
        versionString = $Version; majorVersion = 10; pathWwwRoot = 'C:\inetpub\wwwroot'
        configPath = 'C:\Windows\System32\inetsrv\config\applicationHost.config'
        configLastWriteUtc = $Written; configSha256 = $Sha
    }
}

# --- WEB01 --------------------------------------------------------------------------------
# 07-30 -> 07-31 must differ in a diffable field or the changes feed has nothing to show:
# PortalAppPool's identity is promoted from NetworkService to a domain account, and the
# /api application (with its dependencies) appears.
$web01Sites = {
    # Log statistics deliberately differ between the two snapshots - logs grow every day. The
    # iisSites diff must stay silent about it (census-web.md 9.3, decision W-4).
    param([string]$PortalNewest, [int]$DwsFiles, [long]$DwsTotal, [string]$DwsNewest, [long]$DwsLast24h)
    @(
        [ordered]@{
            name = 'Default Web Site'; id = '1'; serverAutoStart = 'true'
            physicalPath = Path2 '%SystemDrive%\inetpub\wwwroot' 'C:\inetpub\wwwroot'
            bindings = @((Binding 'http' '*:80:' '*' 80 '' $null $null))
            logFile = LogFile 'C:\inetpub\logs\LogFiles\W3SVC1' 'true' $DwsFiles $DwsTotal '2026-07-01T00:04:11Z' $DwsNewest $DwsLast24h
        },
        [ordered]@{
            name = 'portal.example.com'; id = '2'; serverAutoStart = 'true'
            physicalPath = Path2 'D:\sites\portal'
            bindings = @(
                (Binding 'http'  '*:80:portal.example.com'  '*' 80  'portal.example.com' $null $null),
                (Binding 'https' '*:443:portal.example.com' '*' 443 'portal.example.com' '1' 'A1B2C3D4E5F60718293A4B5C6D7E8F9012345678')
            )
            logFile = LogFile 'D:\logs\W3SVC2' 'true' 8 9216 '2026-04-02T00:11:44Z' $PortalNewest 0
        }
    )
}

$web01Pools = {
    param([string]$PortalIdentity, [string]$PortalUser)
    @(
        (Pool 'DefaultAppPool'    'v4.0' 'applicationPoolDefaults' 'Integrated' 'ApplicationPoolIdentity' $null),
        (Pool 'PortalAppPool'     'v4.0' 'pool'                    'Integrated' $PortalIdentity $PortalUser),
        (Pool 'PortalApiPool'     ''     'pool'                    'Integrated' 'ApplicationPoolIdentity' $null),
        (Pool 'LegacyReportsPool' 'v2.0' 'pool'                    'Classic'    'NetworkService' $null)
    )
}

$rootApp = [ordered]@{
    siteName = 'Default Web Site'; path = '/'; physicalPath = Path2 '%SystemDrive%\inetpub\wwwroot' 'C:\inetpub\wwwroot'
    applicationPool = 'DefaultAppPool'; poolManagedRuntimeVersion = 'v4.0'; poolManagedPipelineMode = 'Integrated'
    poolIdentityType = 'ApplicationPoolIdentity'; poolUserName = $null; enabledProtocols = 'http'
    runtime = [ordered]@{ poolManagedRuntimeVersion = 'v4.0'; aspNetCore = $null; hasAppSettingsJson = $false; hasRuntimeConfigJson = $false }
    auth = Auth $true 'serverDefault' $false 'serverDefault'
    virtualDirectories = @([ordered]@{ path = '/'; physicalPath = Path2 '%SystemDrive%\inetpub\wwwroot' 'C:\inetpub\wwwroot'; userName = $null; logonMethod = $null })
    configFiles = [ordered]@{ webConfig = [ordered]@{ status = 'not-present'; path = 'C:\inetpub\wwwroot\web.config' }; appSettingsJson = [ordered]@{ status = 'not-present' } }
    status = 'ok'
}

$portalApp = [ordered]@{
    siteName = 'portal.example.com'; path = '/'; physicalPath = Path2 'D:\sites\portal'
    applicationPool = 'PortalAppPool'; poolManagedRuntimeVersion = 'v4.0'; poolManagedPipelineMode = 'Integrated'
    poolIdentityType = 'SpecificUser'; poolUserName = 'CORP\svc-portal'; enabledProtocols = 'http'
    runtime = [ordered]@{ poolManagedRuntimeVersion = 'v4.0'; aspNetCore = $null; hasAppSettingsJson = $false; hasRuntimeConfigJson = $false }
    auth = Auth $false 'location' $true 'location'
    virtualDirectories = @([ordered]@{ path = '/'; physicalPath = Path2 'D:\sites\portal'; userName = $null; logonMethod = $null })
    configFiles = [ordered]@{ webConfig = [ordered]@{ status = 'ok'; path = 'D:\sites\portal\web.config'; sha256 = '4f1c9b2e7a3d5086c1f4b9e2a7d3c5081f4b9e2a7d3c5086c1f4b9e2a7d3c508' } ; appSettingsJson = [ordered]@{ status = 'not-present' } }
    status = 'ok'
}

$reportsApp = [ordered]@{
    siteName = 'portal.example.com'; path = '/reports'; physicalPath = Path2 'D:\sites\portal\reports'
    applicationPool = 'LegacyReportsPool'; poolManagedRuntimeVersion = 'v2.0'; poolManagedPipelineMode = 'Classic'
    poolIdentityType = 'NetworkService'; poolUserName = $null; enabledProtocols = 'http'
    runtime = [ordered]@{ poolManagedRuntimeVersion = 'v2.0'; aspNetCore = $null; hasAppSettingsJson = $false; hasRuntimeConfigJson = $false }
    auth = Auth $false 'location' $true 'location'
    virtualDirectories = @(
        [ordered]@{ path = '/'; physicalPath = Path2 'D:\sites\portal\reports'; userName = $null; logonMethod = $null },
        [ordered]@{ path = '/archive'; physicalPath = Path2 '\\fs01\reports-archive'; userName = 'CORP\svc-reports'; logonMethod = 'ClearText' }
    )
    configFiles = [ordered]@{ webConfig = [ordered]@{ status = 'ok'; path = 'D:\sites\portal\reports\web.config' }; appSettingsJson = [ordered]@{ status = 'not-present' } }
    status = 'ok'
}

$apiApp = [ordered]@{
    siteName = 'portal.example.com'; path = '/api'; physicalPath = Path2 'D:\sites\portal\api'
    applicationPool = 'PortalApiPool'; poolManagedRuntimeVersion = ''; poolManagedPipelineMode = 'Integrated'
    poolIdentityType = 'ApplicationPoolIdentity'; poolUserName = $null; enabledProtocols = 'http'
    runtime = [ordered]@{
        poolManagedRuntimeVersion = ''
        aspNetCore = [ordered]@{
            processPath = 'dotnet'; arguments = '.\Portal.Api.dll'; hostingModel = 'inprocess'
            environmentVariables = [ordered]@{ ASPNETCORE_ENVIRONMENT = 'Production' }
        }
        hasAppSettingsJson = $true; hasRuntimeConfigJson = $true
    }
    auth = Auth $true 'serverDefault' $false 'serverDefault'
    virtualDirectories = @([ordered]@{ path = '/'; physicalPath = Path2 'D:\sites\portal\api'; userName = $null; logonMethod = $null })
    configFiles = [ordered]@{ webConfig = [ordered]@{ status = 'ok'; path = 'D:\sites\portal\api\web.config' }; appSettingsJson = [ordered]@{ status = 'ok'; path = 'D:\sites\portal\api\appsettings.json' } }
    status = 'ok'
}

# Each of these three exists to prove one alias-join decision, and would be indistinguishable
# from a plain 'unobserved' without the corresponding fixture:
#   - BillingDb names SQL01 by FQDN, so it can only resolve through the fqdn alias.
#   - SharedCertDb names a host that appears only as a certSan, which is deliberately NOT
#     join-eligible - a shared certificate must not let one machine claim another's identity.
#   - VipDb names an address both WEB01 and APPSRV01 claim, so it must stay unresolved rather
#     than silently picking one.
$web01AliasProofDeps = @(
    (DbEdge 'portal.example.com' '/' 'web.config' 'BillingDb'    'sql01.corp.local' 'PROD' $null 'Billing'  'integrated'),
    (DbEdge 'portal.example.com' '/' 'web.config' 'SharedCertDb' 'sqlfarm.corp.local' $null $null 'Portal'  'integrated'),
    (DbEdge 'portal.example.com' '/' 'web.config' 'VipDb'        '10.0.0.50' $null $null 'Portal'           'integrated')
)

$web01BaseDeps = @(
    (DbEdge 'portal.example.com' '/' 'web.config' 'PortalDb' 'SQL01' 'PROD' $null 'Portal' 'integrated'),
    (DbEdge 'portal.example.com' '/' 'web.config' 'DefaultConnection' 'WEB01' $null $null 'PortalLocal' 'integrated' $true),
    (HttpEdge 'portal.example.com' '/' 'web.config' 'PaymentGatewayUrl' 'https' 'payments.vendor.example.com' 443 '/v2/charge' $false $true),
    (HttpEdge 'portal.example.com' '/reports' 'web.config' 'LegacyFeedUrl' 'http' 'legacy-reports.example.com' 80 '/feed' $true $false)
) + $web01AliasProofDeps

$web01Aliases = @(
    (Alias 'netbios' 'WEB01' 'identity'),
    (Alias 'fqdn' 'web01.corp.local' 'identity'),
    (Alias 'machineGuid' 'f2c1a7d4-90bb-4e11-8a33-6d2e5c0f9a71' 'identity'),
    (Alias 'ipv4' '10.0.0.10' 'network'),
    # A load-balancer VIP that APPSRV01 also answers on: the pair makes this alias ambiguous.
    (Alias 'ipv4' '10.0.0.50' 'network'),
    (Alias 'bindingHostHeader' 'portal.example.com' 'iis'),
    (Alias 'certSan' 'portal.example.com' 'certificates')
)
$appsrv01Aliases = @(
    (Alias 'netbios' 'APPSRV01' 'identity'),
    (Alias 'fqdn' 'appsrv01.corp.local' 'identity'),
    (Alias 'machineGuid' '77b0e5c2-1a4f-4c88-9f10-3b8d61e2a004' 'identity'),
    (Alias 'ipv4' '10.0.0.11' 'network'),
    (Alias 'ipv4' '10.0.0.50' 'network'),
    (Alias 'bindingHostHeader' 'intranet.corp.local' 'iis'),
    (Alias 'bindingHostHeader' 'portal.example.com' 'iis')
)
$aliasSources = [ordered]@{ identity = 'ok'; sqlserver = 'not-present'; iis = 'ok'; certificates = 'ok'; network = 'ok' }

$web01ApiDeps = @(
    (DbEdge 'portal.example.com' '/api' 'appsettings.json' 'Reporting' 'SQL01' 'PROD' 1433 'Reporting' 'sql' $false $true),
    (HttpEdge 'portal.example.com' '/api' 'appsettings.json' 'Services:Billing:BaseUrl' 'https' 'billing.example.com' 443 '/api/v1')
)

$targets = @(
    @{
        Aliases = AliasCategory $web01Aliases $aliasSources
        File = 'WEB01\web01-census-20260730.json'
        Iis  = [ordered]@{
            server       = Server '10.0.20348.1' '2026-06-14T09:12:33Z' 'b7d1e4a9c2f508361b7d1e4a9c2f508361b7d1e4a9c2f508361b7d1e4a9c2f508'
            sites        = & $web01Sites '2026-05-12T18:22:41Z' 30 46551040 '2026-07-30T23:57:44Z' 1512448
            appPools     = & $web01Pools 'NetworkService' $null
            applications = @($rootApp, ($portalApp | ForEach-Object { $c = [ordered]@{}; $_.GetEnumerator() | ForEach-Object { $c[$_.Key] = $_.Value }; $c.poolIdentityType = 'NetworkService'; $c.poolUserName = $null; $c }), $reportsApp)
            dependencies = $web01BaseDeps
        }
        Duration = 71
    },
    @{
        Aliases = AliasCategory $web01Aliases $aliasSources
        File = 'WEB01\web01-census-20260731.json'
        Iis  = [ordered]@{
            server       = Server '10.0.20348.1' '2026-07-31T06:41:02Z' 'e2a7d3c5081f4b9e2a7d3c5081f4b9e2a7d3c5081f4b9e2a7d3c5081f4b9e2a7'
            sites        = & $web01Sites '2026-05-12T18:22:41Z' 31 48123904 '2026-07-31T23:58:02Z' 1583104
            appPools     = & $web01Pools 'SpecificUser' 'CORP\svc-portal'
            applications = @($rootApp, $portalApp, $apiApp, $reportsApp)
            dependencies = @($web01BaseDeps + $web01ApiDeps)
        }
        Duration = 88
    },
    @{
        Aliases = AliasCategory $appsrv01Aliases $aliasSources
        File = 'APPSRV01\appsrv01-census-20260731.json'
        Iis  = [ordered]@{
            server = Server '10.0.17763.1' '2026-02-03T14:55:10Z' '9c2f508361b7d1e4a9c2f508361b7d1e4a9c2f508361b7d1e4a9c2f508361b7d1'
            sites  = @(
                [ordered]@{
                    name = 'Default Web Site'; id = '1'; serverAutoStart = 'false'
                    physicalPath = Path2 '%SystemDrive%\inetpub\wwwroot' 'C:\inetpub\wwwroot'
                    bindings = @((Binding 'http' '*:80:' '*' 80 '' $null $null))
                    logFile = LogFile 'C:\inetpub\logs\LogFiles\W3SVC1' 'false' 0 0 $null $null 0 $false
                },
                [ordered]@{
                    name = 'intranet-app'; id = '2'; serverAutoStart = 'true'
                    physicalPath = Path2 'E:\apps\intranet'
                    bindings = @((Binding 'http' '*:8080:intranet.corp.local' '*' 8080 'intranet.corp.local' $null $null))
                    logFile = LogFile 'E:\logs\W3SVC2' 'true' 12 3145728 '2026-07-20T00:02:19Z' '2026-07-31T22:41:07Z' 262144
                },
                # Second node of the portal farm. Its /api application was never migrated to
                # Core, so the estate-level applications pivot shows a runtime spread that no
                # single machine's dossier could reveal (census-web.md 11.3).
                [ordered]@{
                    name = 'portal.example.com'; id = '3'; serverAutoStart = 'true'
                    physicalPath = Path2 'E:\sites\portal'
                    bindings = @((Binding 'http' '*:80:portal.example.com' '*' 80 'portal.example.com' $null $null))
                    logFile = LogFile 'E:\logs\W3SVC3' 'true' 9 1048576 '2026-07-23T00:01:55Z' '2026-07-31T23:12:40Z' 131072
                }
            )
            appPools = @(
                (Pool 'DefaultAppPool' 'v4.0' 'applicationPoolDefaults' 'Integrated' 'ApplicationPoolIdentity' $null),
                (Pool 'IntranetPool'   'v4.0' 'pool'                    'Integrated' 'SpecificUser' 'CORP\svc-intranet'),
                (Pool 'PortalApiPool'  'v4.0' 'pool'                    'Integrated' 'ApplicationPoolIdentity' $null)
            )
            applications = @(
                [ordered]@{
                    siteName = 'Default Web Site'; path = '/'; physicalPath = Path2 '%SystemDrive%\inetpub\wwwroot' 'C:\inetpub\wwwroot'
                    applicationPool = 'DefaultAppPool'; poolManagedRuntimeVersion = 'v4.0'; poolManagedPipelineMode = 'Integrated'
                    poolIdentityType = 'ApplicationPoolIdentity'; poolUserName = $null; enabledProtocols = 'http'
                    runtime = [ordered]@{ poolManagedRuntimeVersion = 'v4.0'; aspNetCore = $null; hasAppSettingsJson = $false; hasRuntimeConfigJson = $false }
                    auth = Auth $true 'serverDefault' $false 'serverDefault'
                    virtualDirectories = @([ordered]@{ path = '/'; physicalPath = Path2 '%SystemDrive%\inetpub\wwwroot' 'C:\inetpub\wwwroot'; userName = $null; logonMethod = $null })
                    configFiles = [ordered]@{ webConfig = [ordered]@{ status = 'not-present' }; appSettingsJson = [ordered]@{ status = 'not-present' } }
                    status = 'ok'
                },
                [ordered]@{
                    siteName = 'intranet-app'; path = '/'; physicalPath = Path2 'E:\apps\intranet'
                    applicationPool = 'IntranetPool'; poolManagedRuntimeVersion = 'v4.0'; poolManagedPipelineMode = 'Integrated'
                    poolIdentityType = 'SpecificUser'; poolUserName = 'CORP\svc-intranet'; enabledProtocols = 'http'
                    runtime = [ordered]@{ poolManagedRuntimeVersion = 'v4.0'; aspNetCore = $null; hasAppSettingsJson = $false; hasRuntimeConfigJson = $false }
                    auth = Auth $false 'webConfig' $true 'webConfig'
                    virtualDirectories = @([ordered]@{ path = '/'; physicalPath = Path2 'E:\apps\intranet'; userName = $null; logonMethod = $null })
                    configFiles = [ordered]@{ webConfig = [ordered]@{ status = 'ok'; path = 'E:\apps\intranet\web.config' }; appSettingsJson = [ordered]@{ status = 'not-present' } }
                    status = 'ok'
                },
                [ordered]@{
                    siteName = 'intranet-app'; path = '/uploads'; physicalPath = Path2 '%UPLOADSHARE%\intranet' '%UPLOADSHARE%\intranet' $false
                    applicationPool = 'IntranetPool'; poolManagedRuntimeVersion = 'v4.0'; poolManagedPipelineMode = 'Integrated'
                    poolIdentityType = 'SpecificUser'; poolUserName = 'CORP\svc-intranet'; enabledProtocols = 'http'
                    runtime = [ordered]@{ poolManagedRuntimeVersion = 'v4.0'; aspNetCore = $null; hasAppSettingsJson = $false; hasRuntimeConfigJson = $false }
                    auth = Auth $false 'webConfig' $true 'webConfig'
                    virtualDirectories = @([ordered]@{ path = '/'; physicalPath = Path2 '%UPLOADSHARE%\intranet' '%UPLOADSHARE%\intranet' $false; userName = $null; logonMethod = $null })
                    configFiles = [ordered]@{ webConfig = [ordered]@{ status = 'not-present' }; appSettingsJson = [ordered]@{ status = 'not-present' } }
                    status = 'failed'; reason = 'physical path does not resolve: %UPLOADSHARE% is not defined on this machine'
                },
                [ordered]@{
                    siteName = 'portal.example.com'; path = '/'; physicalPath = Path2 'E:\sites\portal'
                    applicationPool = 'DefaultAppPool'; poolManagedRuntimeVersion = 'v4.0'; poolManagedPipelineMode = 'Integrated'
                    poolIdentityType = 'ApplicationPoolIdentity'; poolUserName = $null; enabledProtocols = 'http'
                    runtime = [ordered]@{ poolManagedRuntimeVersion = 'v4.0'; aspNetCore = $null; hasAppSettingsJson = $false; hasRuntimeConfigJson = $false }
                    auth = Auth $false 'location' $true 'location'
                    virtualDirectories = @([ordered]@{ path = '/'; physicalPath = Path2 'E:\sites\portal'; userName = $null; logonMethod = $null })
                    configFiles = [ordered]@{ webConfig = [ordered]@{ status = 'ok'; path = 'E:\sites\portal\web.config' }; appSettingsJson = [ordered]@{ status = 'not-present' } }
                    status = 'ok'
                },
                # Still .NET Framework where WEB01 runs ASP.NET Core - the runtime spread.
                [ordered]@{
                    siteName = 'portal.example.com'; path = '/api'; physicalPath = Path2 'E:\sites\portal\api'
                    applicationPool = 'PortalApiPool'; poolManagedRuntimeVersion = 'v4.0'; poolManagedPipelineMode = 'Integrated'
                    poolIdentityType = 'ApplicationPoolIdentity'; poolUserName = $null; enabledProtocols = 'http'
                    runtime = [ordered]@{ poolManagedRuntimeVersion = 'v4.0'; aspNetCore = $null; hasAppSettingsJson = $false; hasRuntimeConfigJson = $false }
                    auth = Auth $true 'serverDefault' $false 'serverDefault'
                    virtualDirectories = @([ordered]@{ path = '/'; physicalPath = Path2 'E:\sites\portal\api'; userName = $null; logonMethod = $null })
                    configFiles = [ordered]@{ webConfig = [ordered]@{ status = 'ok'; path = 'E:\sites\portal\api\web.config' }; appSettingsJson = [ordered]@{ status = 'not-present' } }
                    status = 'ok'
                }
            )
            dependencies = @(
                (DbEdge 'intranet-app' '/' 'web.config' 'IntranetDb' 'SQL01' $null $null 'Intranet' 'integrated'),
                ([ordered]@{
                    siteName = 'intranet-app'; appPath = '/'; sourceFile = 'web.config'; kind = 'file'; name = 'ScratchDb'
                    host = $null; rawHost = 'E:\apps\intranet\App_Data\scratch.mdf'; isLocal = $false
                    instance = $null; port = $null; protocol = $null
                    filePath = 'E:\apps\intranet\App_Data\scratch.mdf'; database = $null; authMode = 'integrated'
                    provider = 'System.Data.SqlClient'; encrypt = $null; trustServerCertificate = $null
                    secretsPresent = $false; parseStatus = 'ok'
                    sha256 = FakeSha 'intranet-app|/|web.config|ScratchDb|file'
                }),
                (HttpEdge 'intranet-app' '/' 'web.config' 'DirectorySvc' 'http' 'appsrv01' 9001 '/directory' $false $false $true)
            )
        }
        Duration = 63
    }
)

foreach ($target in $targets) {
    $path = Join-Path $root $target.File
    $envelope = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $envelope.iis = [PSCustomObject]([ordered]@{
        status     = 'ok'
        data       = $target.Iis
        durationMs = $target.Duration
    })
    # `aliases` is a post-pass category the demo envelopes predate, so it is added rather than
    # assigned.
    $envelope | Add-Member -NotePropertyName aliases -NotePropertyValue $target.Aliases -Force
    $envelope | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $path -Encoding utf8
    Write-Host "rewrote $($target.File)"
}
