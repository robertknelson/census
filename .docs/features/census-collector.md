# Census Collector — Script Spec

> **Scope of this document:** the PowerShell collector and its JSON output contract only —
> the piece that runs, gathers facts, and writes files to disk. It is a trim of
> `.docs/plan.md` (Opus's full census design) down to what is needed to *write the script*.
>
> **Deliberately excluded, and why:** `.docs/plan.md` §9 (classification/scoring) and §10
> (phase-2 reports) describe a reader application that does not exist yet and is a separate
> project. The collector's job is to observe facts, never to score or classify them — so
> those sections have no bearing on this script. `config/roles.json` and
> `config/lifecycle.json` are reader-side inputs for the same reason and are not consulted by
> anything below. If the reader is built later, go back to `.docs/plan.md` for that design —
> it is not lost, just out of scope here.
>
> **Downstream consumer:** `.docs/features/graph-interop.md` records what census owes the
> dependency-graph effort and what it must never do to it. Two things in this spec exist
> because of it — the alias set (§8.1.1) and the resolution asymmetry on dependency edges
> (§8.6.7). Neither makes census aware of that system; read GI-1 and GI-9 before changing
> either.

---

## 1. What this script does

Reads a JSON list of machines, executes a local-only collector against each over WinRM, and
writes one JSON census document per machine per day to disk, laid out the way IIS log files
are — a folder per machine, daily files inside. Run once a day by a Task Scheduler job.

**Scale:** a couple dozen machines. Small enough that reliability beats throughput — nothing
in the design may depend on concurrency; sequential must remain a valid mode. A single
account reaches everything today, but the config carries a credential-bucket seam because
it's nearly free now and expensive to retrofit later.

---

## 2. Prior art carried into the script's shape

| Source | What is taken |
|---|---|
| `C:\github\ai\LogExplorer\sample-logs\` | On-disk layout: `<root>\<MACHINE>\<datestamped file>`, `.gz` for aged files, filename-encoded dates, directory listing as the index. |
| `C:\github\ai\ai-sql-mover\scripts\Invoke-SqlMigrationController.ps1` | PowerShell shape: `param()` + `-Execute` switch for dry-run vs live, structured `[ordered]@{}` log records, per-item `try/catch` nested inside a controller `try/catch`, `Execute-NativeSql` using raw `System.Data.SqlClient` with `Integrated Security=True` — no `SqlServer` module dependency. |
| `C:\github\ai\LogExplorer\tools\generate-sample-logs.ps1` | Style: comment-based help header, `param()` block, `$ErrorActionPreference = 'Stop'`, `# --- section ---` dividers, PascalCase params, camelCase locals. |

### Verified on the dev box (2026-07-31)

- `pwsh` 7.6.3 and Windows PowerShell 5.1 both present.
- `WebAdministration`, `IISAdministration`, `SqlServer`, `ServerManager`, `ActiveDirectory`
  modules **not available**. `Storage` and `SmbShare` are in-box.
- WinRM service **Stopped**; `TrustedHosts` not readable unelevated.
- No IIS and no SQL Server locally — this box is the natural **`not-present`** fixture for
  both collectors.

These settle two mechanism choices: IIS is read from `applicationHost.config` as XML, and SQL
Server through raw `System.Data.SqlClient`.

---

## 3. Repository layout

```
census/
  Invoke-Census.ps1              # orchestrator — reads machines.json, fans out, writes files
  Get-MachineCensus.ps1          # runs ON the target, returns one JSON string
  Build-Collector.ps1            # concatenates into a standalone portable collector
  collectors/                    # identity os updates apps features services tasks network
                                 # iis certs sqlserver drives memory security usage hosted
  config/
    machines.json                # the enumerated list + credential buckets (operator-owned)
    census.config.json           # root path, throttle, timeouts, profile, retention
    creds/                       # DPAPI .cred.xml files — git-ignored, never committed
  .docs/
    features/census-collector.md # this file
    spec/decisions.md            # CD-1..CD-9 with rationale
```

---

## 4. Output layout

Deliberately isomorphic to an IIS log tree.

```
<CensusRoot>\
  WEB01\
    census-20260729.json.gz      # aged files gzipped, as IIS rotation does
    census-20260730.json
    census-20260731.json
  SQL01\
    census-20260731.json
  DEV-VM-04\
    census-20260730.json         # absent 07-31 = machine was unreachable that day
  _runs\
    run-20260731T0300Z.json      # run manifest: expected vs collected, per-machine outcome
```

Rules:

- **One file per machine per day**, `census-YYYYMMDD.json`, UTC date of the run.
- **Full snapshot every day, not deltas.** Any single file is complete and self-describing —
  readable with no replay. Drift diffing is a reader concern, not the writer's.
- **Absence is signal.** A missing file means the machine was not collected that day. The run
  manifest is what distinguishes that from "collected, found nothing".
- **`_runs\` is underscore-prefixed** so a scanner enumerating machine folders skips it with
  one rule.
- **Aging** gzips files older than N days in place.
- **Machine folder name** is the `name` from `machines.json`, uppercased — the requested
  name, not the discovered one, so a machine that renames itself does not silently start a
  second folder. A mismatch between requested and discovered name is recorded in the envelope.

---

## 5. Collection mechanism

### 5.1 One collector, executed locally, shipped in

`Get-MachineCensus.ps1` **never accepts a `-ComputerName`.** It always runs on the machine it
is describing and returns **exactly one `[string]`** — the already-serialised JSON.
`Invoke-Census.ps1` ships it with:

```powershell
Invoke-Command -Session $session -FilePath .\Get-MachineCensus.ps1
```

`-FilePath` transfers the script *text* into the session: nothing is written to the target's
disk and there is nothing to clean up.

**Why not remote CIM/DCOM.** Needs port 135 plus a dynamic high-port range (routinely
blocked) and cannot reach registry hives, `applicationHost.config`, the Windows Update Agent
COM API, or a local SQL instance.

**Why not an installed agent.** A daily census against a stable estate does not justify a new
thing to deploy, patch and defend to security.

**Portable fallback.** `Build-Collector.ps1` concatenates the collector fragments into one
standalone `.ps1` for machines WinRM cannot reach. Identical envelope, `context.transport`
records `"portable"`.

#### Two traps to design around, not discover

1. **`Invoke-Command` serialises return values** through the PSRemoting object graph,
   mangling types and flattening depth. Hence the single-string contract.
2. **`ConvertTo-Json` defaults to `-Depth 2`** and silently truncates deeper structures to
   `"System.Object[]"`. Always `-Depth 10 -Compress`, explicitly. The IIS payload alone is
   five levels deep.

#### Double-hop

Inside a WinRM session the account holds a network logon token: **local** resources are
reachable, **remote** ones are not.

- **SQL Server is local** — connect to `Server=.\INSTANCE;Integrated Security=SSPI` over
  shared memory. Not a second hop. **Prove this empirically in Slice 1** against one real
  remote box — everything in the SQL collector depends on it.
- **Mapped network drives are a genuine second hop.** Free space on `\\fs01\share` cannot be
  read from a remoted session. Emit the mapping with `sizeStatus: "unavailable", reason:
  "double-hop"`.
- **CredSSP is never enabled.** It hands a delegatable credential to a machine you are
  auditing precisely because you do not know its state.

### 5.2 The machine list and credential buckets

```json
{
  "version": 1,
  "buckets": [
    { "id": "corp", "description": "Domain-joined production",
      "credential": { "kind": "task-identity" } },
    { "id": "dmz",  "description": "DMZ web tier, separate forest",
      "credential": { "kind": "clixml", "path": "config\\creds\\dmz.cred.xml" },
      "trustedHosts": ["dmz-web01", "dmz-web02"] }
  ],
  "machines": [
    { "name": "WEB01",     "bucket": "corp", "expected": true, "notes": "" },
    { "name": "DEV-VM-04", "bucket": "corp", "expected": true, "notes": "dev VM on Server SKU" }
  ]
}
```

- `kind: "task-identity"` means *use the account the scheduled task already runs as* — no
  stored secret at all. Current single-account case; stays the default.
- `kind: "clixml"` points at a DPAPI-protected `Export-CliXml` file, machine- **and**
  user-bound, decryptable only by the census account on the control box. Never in the repo,
  never on a command line.
- `trustedHosts` is per-bucket and **explicitly enumerated — never `*`.** Workgroup targets
  fall back from Kerberos to NTLM, which requires the entry on the control box.
- Every machine names exactly one bucket. No bucket is a config error, not a default.
- The envelope records `context.bucket`.

The Task Scheduler job runs as a dedicated account that is a member of **local
Administrators** on the targets. Domain Admin is not required and should be actively refused.
The task runs with *Run whether user is logged on or not* + *Run with highest privileges*, so
its own credential lives in the Windows credential store.

### 5.3 Reachability is a reported number, not an error

Laptops are off — that's normal, not a failure. Every run does a pre-flight probe per
machine, in order, recording each result:

**DNS resolve → TCP 5985/5986 → `Test-WSMan` → admin-rights check.**

Four different diagnoses — no DNS record, no route, WinRM not listening, listening but access
denied — with four different remediations. The run manifest reports **expected / collected /
partial / unreachable** per machine with the diagnosis.

### 5.4 Collection profiles

Set once in `census.config.json`; recorded in the envelope so a consumer knows why a field is
missing.

- **`Standard`** (default, what the nightly job runs) — everything safe and bounded.
- **`Deep`** (opt-in) — Windows Update online scan, filesystem scans for source folders and
  `.pdb`s, per-database SQL loops, full firewall rule enumeration, third-party CLI calls.
  Real value, real cost; not for a nightly job across the fleet.
- **`Forensic`** (explicit per-run consent) — `reg load` of unloaded `NTUSER.DAT`, Security
  event log mining, `secedit /export`.

**Banned at every profile, by construction:** `Win32_Product` enumeration (§8.4), decrypting
protected config sections, and **any write of any kind on a target machine.**

`Invoke-Census.ps1 -WhatIf` prints exactly which collectors and which commands would run at
the chosen profile.

---

## 6. The envelope — the actual contract

```json
{
  "schemaVersion": 1,
  "run": {
    "runId": "run-20260731T0300Z",
    "startedUtc": "2026-07-31T03:00:11Z",
    "finishedUtc": "2026-07-31T03:00:52Z",
    "durationMs": 41220,
    "collectorVersion": "1.0.0",
    "profile": "Standard"
  },
  "target": {
    "requestedName": "WEB01",
    "computerName": "WEB01",
    "fqdn": "web01.corp.local",
    "machineGuid": "…",
    "smbiosUuid": "…",
    "domain": "corp.local",
    "domainRole": 3
  },
  "context": {
    "transport": "winrm",
    "bucket": "corp",
    "psVersion": "5.1.19041.4291",
    "runAs": "CORP\\svc-census",
    "elevated": true,
    "is64Bit": true
  },
  "collectors": {
    "os":        { "version": "1.0", "status": "ok",                  "durationMs": 120,   "hash": "a1b2…", "data": { } },
    "iis":       { "version": "1.0", "status": "not-present",         "durationMs": 40,    "reason": "HKLM:\\SOFTWARE\\Microsoft\\InetStp absent" },
    "sqlserver": { "version": "1.0", "status": "insufficient-rights", "durationMs": 900,   "reason": "VIEW ANY DEFINITION denied on MSSQLSERVER" },
    "updates":   { "version": "1.0", "status": "timed-out",           "durationMs": 30000, "reason": "WUA QueryHistory exceeded 30s budget" }
  },
  "diagnostics": [
    { "level": "warn", "collector": "drives", "message": "…" }
  ]
}
```

### 6.1 No top-level `data` blob

Payload always nests under its collector, so a partial run is *structurally identical* to a
complete one. Hard rule for every consumer: **read `collectors.X.status` before touching
`collectors.X.data`.**

### 6.2 Status vocabulary — unknown is never absent

| Status | Meaning |
|---|---|
| `ok` | Ran, produced data |
| `not-present` | **Proved** the subject is genuinely absent. A positive finding. |
| `not-applicable` | Doesn't apply to this OS/SKU (`Get-WindowsFeature` on Windows 11) |
| `insufficient-rights` | Precondition met, access denied. **Truth is unknown.** |
| `failed` | Threw. Carries exception type and message. |
| `timed-out` | Exceeded the collector's budget |
| `skipped` | Excluded by profile, or a prerequisite collector failed |

`not-present` ≠ `failed` ≠ `insufficient-rights`. A consumer must never render an unknown as
an absence.

### 6.3 Per-collector `hash` — and the volatile-field rule

A SHA-256 over the payload, so "did anything change" is a filename scan and a field compare
later, without deep-diffing a year of files.

**This only works if volatile fields are excluded from the hashed projection.** Free-space
bytes, PIDs, uptime, timestamps, durations, working-set sizes — all change every single day.
Include them and every hash differs on day two and the whole mechanism dies. Volatile fields
stay in `data`; they are simply not part of the hash input. Collections are sorted by their
diff key before hashing so ordering never registers as change.

### 6.4 Diff keys — named per collection, and several obvious choices are wrong

Every array element carries a key that survives reordering and renaming.

| Collection | Key | **Not** |
|---|---|---|
| Volumes | `UniqueId` | ~~drive letter~~ — reassigned |
| Installed software | (Publisher, DisplayName, Architecture, Scope, OwnerSid) | ~~uninstall key GUID~~ — changes on major upgrade |
| Services | `Name` | ~~DisplayName~~ |
| IIS sites | `Name` | ~~SiteId~~ — renumbers |
| IIS applications | (SiteName, Path) | |
| IIS app pools | `Name` | |
| IIS dependency edges | (SiteName, AppPath, SourceFile, Kind, Name) | ~~the target~~ — the target changing *is* the change you want to see |
| Machine aliases | (Kind, Value) | ~~Value~~ alone — the same string legitimately arrives as two kinds |
| Certificates | (Thumbprint, StoreName) | ~~Subject~~ — renewal keeps the subject |
| SQL databases | (InstanceName, DatabaseName) | ~~database_id~~ — reused after a drop |
| SQL database files | (InstanceName, DatabaseName, LogicalFileName) | ~~physical_name~~ |
| Scheduled tasks | (TaskPath, TaskName) | |
| Local group members | (GroupName, **SID**) | ~~account name~~ — renames |
| Network adapters | MacAddress | ~~index~~ |
| Hotfixes | HotFixID | |

### 6.5 Per-collector `version`

Bumped when a payload shape changes, so a consumer spanning a year of files can handle an old
shape rather than crash on it.

### 6.6 Fallback paths must be recorded

Where a collector used a degraded path (`netstat` instead of `Get-NetTCPConnection`,
`Win32_LogicalDisk` instead of `Get-Volume`, ADSI instead of `Get-LocalGroupMember`), the
payload records which path ran. **Fallbacks return less data, and that difference must not
look like a change in the diff.**

### 6.7 Redaction is a schema-level invariant

The collector **never** emits: app-pool passwords, virtual-directory passwords, certificate
private keys, `machineKey` values, SQL `password_hash`, linked-server remote passwords,
BitLocker recovery keys, LAPS passwords, product keys, or any connection string containing
credentials.

Identity capture is `identityType` + `userName` only.

**Connection strings are parse-and-drop, never store-and-encrypt.** Parsed to
`{ name, server, database, authMode, encrypt, trustServerCertificate }` plus a
`secretsPresent` boolean and a SHA-256 of the normalized full string. The raw string is
discarded at the point of collection and never reaches disk.

**Downstream URLs are parse-and-drop on the same terms** (§8.6.7). Userinfo and query string
are stripped where they are read and never written; their presence survives as
`hadCredentials` / `hadQuery` booleans. `https://user:pass@host/` and `?api_key=…` are both
secrets in a field nobody thinks of as a secret field.

**Encrypted config sections** are recorded as "encrypted, not decrypted". Never attempt
decryption.

---

## 7. Collector contract

One file per collector under `collectors\`, dot-sourced by `Get-MachineCensus.ps1`. Each
returns a hashtable:

```powershell
@{
    Name          = 'iis'
    Version       = '1.0'
    RequiresAdmin = $true
    Profile       = 'Standard'          # Standard | Deep | Forensic
    Precondition  = { Test-Path 'HKLM:\SOFTWARE\Microsoft\InetStp' }
    Invoke        = { <# returns the payload; may throw freely #> }
}
```

A single generic runner wraps every one — per-collector stopwatch, per-collector timeout
budget, `try/catch` recording exception type and message, and a guarantee that **no collector
can abort the run.** Nested-`try/catch` shape: per-item inside per-controller.

`Precondition` is what produces an honest `not-present`. It must be a **cheap positive proof
of absence** — a registry key that is not there — never an inference from an empty result.

### 7.1 PowerShell floor

**Target Windows PowerShell 5.1** for both scripts. It is on every Server 2016+ and patched
2012 R2 box; `pwsh` is not. No `??`, no ternary, no `ForEach-Object -Parallel`, no
`ConvertFrom-Json -AsHashtable`. **5.1 compatibility must be tested deliberately**
(`powershell.exe -File …`), not assumed.

If Server 2012 R2 (PowerShell 4.0) is in scope, four collectors need fallbacks —
`Get-Volume`, `Get-NetTCPConnection`, `Get-NetAdapter`, and the `LocalAccounts` module are
absent or behave differently. Record which path ran (§6.6).

### 7.2 Always-on safety rails

- Hard timeout on **every** CIM/WMI call. WMI hangs are the classic cause of a census that
  never finishes.
- Per-collector budget plus an overall per-machine ceiling.
- Fleet concurrency default 8, configurable, never the whole fleet at once.
- Deterministic collection ordering, so diffs are not noise.
- A failed collector records its status and the run continues. **Never abort a machine
  because one collector failed.**

---

## 8. Field inventory

**MUST** = explicitly requested. **HIGH** = strongly recommended. **NICE** = cheap, add if
free. Profile tag where not `Standard`.

### 8.1 `identity` — hardware and who this machine is *(HIGH)*

`Win32_ComputerSystem` (Name, Domain, DomainRole, Manufacturer, Model,
TotalPhysicalMemory), `Win32_ComputerSystemProduct` (UUID), `Win32_BIOS` (SerialNumber,
SMBIOSBIOSVersion, ReleaseDate), `Win32_Processor`, `Win32_SystemEnclosure`, `Win32_Battery`,
`HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`.

- **Physical vs virtual, and which hypervisor.** From Model/Manufacturer (`VMware, Inc.`;
  `Microsoft Corporation` + `Virtual Machine` = Hyper-V; `HVM domU` = Xen; `KVM`/`QEMU`;
  `Amazon EC2`; `Google Compute Engine`), corroborated by BIOS serial prefix and guest-tools
  services (`VMTools`, `vmicheartbeat`).
  **Trap: `Win32_ComputerSystem.HypervisorPresent` is `True` on a Hyper-V *host* and on any
  box with VBS / Credential Guard. It is not a "this is a VM" flag.** Corroboration only.
- **Chassis type + battery presence** *(HIGH)* — `Win32_SystemEnclosure.ChassisTypes`
  (3/6/7 desktop, 8/9/10/14 laptop, 23 rack). Discriminator that does **not** depend on OS
  SKU.
- **CPU** *(HIGH)* — socket count (instance count of `Win32_Processor`), `NumberOfCores`,
  `NumberOfLogicalProcessors`, Name, MaxClockSpeed.
- **Serial / model / SMBIOS UUID** — identity key that survives a rename.
- **Duplicate `machineGuid` or SMBIOS UUID across machines is a finding, not something to
  dedupe silently.** Record it; do not resolve it.
- **RAM** *(MUST)* — see §8.10.
- *(NICE)* TPM, Secure Boot, firmware mode.

#### 8.1.1 `aliases` — every name this machine answers to *(MUST)*

Added 2026-08-07. The purpose is the join described in `.docs/features/graph-interop.md` §4: a
downstream consumer has to match this machine against a model whose node names were typed by
people, from memory and tickets, over years. Census emits the **whole name surface** and
**never performs the match itself** — the moment it picks the right name, it is governing a
model it cannot see (GI-4).

Each entry is `{ kind, value, source }`. The kinds are not equally trustworthy and the
consumer needs to weight them, so the kind is part of the payload rather than flattened away:

| Kind | Assembled from | Strength |
|---|---|---|
| `netbios` | `$env:COMPUTERNAME` | Strong — what the machine calls itself |
| `fqdn` | `Win32_ComputerSystem` Name + Domain | Strong |
| `machineGuid` | `HKLM\SOFTWARE\Microsoft\Cryptography` | Strong, survives rename — the consumer's mapping key |
| `smbiosUuid`, `biosSerial` | `Win32_ComputerSystemProduct`, `Win32_BIOS` | Strong, survives rename **and** reinstall |
| `sqlInstance` | §8.8 instance names | Strong — `HOST\INSTANCE` is very often the string in the model |
| `bindingHostHeader` | §8.6.2 IIS bindings | Medium — frequently the name people actually use |
| `certSan` | §8.7 certificate SANs | **Weak** — wildcard and shared certs name machines that are not this one |
| `ipv4` | §8.13 listening addresses | Weak and volatile |

Rules:

- **Derived, therefore last.** It aggregates from `iis`, `certs`, `sqlserver` and `network`,
  so it cannot be ordered among them — it is a post-pass (§9).
- **It must record which source collectors contributed** (§6.6). An alias set assembled while
  the IIS collector was failing is *smaller*, and that must not read as aliases having been
  removed.
- Diff key is **(Kind, Value)** (§6.4).
- **`ipv4` entries are volatile** and excluded from the hashed projection (§6.3) — DHCP churns.
  Every other kind is stable and belongs in the hash.
- Census asserts only that these are names the machine answers to. It asserts nothing about
  which one is correct.
- **The duplicate-`machineGuid` rule above is now an integrity constraint, not a nicety** —
  a consumer keys its mapping table on `machineGuid`, so a cloned-without-sysprep pair
  collapses two machines onto one row. Keep reporting it; keep not resolving it.

### 8.2 `os` — OS and lifecycle facts *(MUST + HIGH)*

`Win32_OperatingSystem` and `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion`.

- **`InstallationType`** (`Client` / `Server` / `Server Core`) — collect alongside
  `ProductType`; both feed classification later, but the script only records them.
- **`CurrentBuild` + `UBR`** *(MUST)* — the true patch level, e.g. `20348.2582`. Exact,
  cheap, and unlike `Get-HotFix` **it cannot lie.**
- `DisplayVersion` / `ReleaseId`, `EditionID`, `ProductName`, `ProductType`, `OSArchitecture`,
  `InstallDate`, `LastBootUpTime`, SP level.
- **Pending reboot** *(HIGH)* — union of `…\Component Based Servicing\RebootPending`,
  `…\WindowsUpdate\Auto Update\RebootRequired`, `PendingFileRenameOperations`,
  `ServerManager\CurrentRebootAttempts`, and ActiveComputerName ≠ ComputerName.
- **Activation** *(HIGH)* — `SoftwareLicensingProduct` where `PartialProductKey` is non-null:
  `LicenseStatus`, KMS vs MAK, grace period. **Never the product key.**
- **Uptime.**
- *(NICE)* time zone + NTP source (`w32tm /query /source`), page file config, crash dump
  setting, locale.

### 8.3 `updates` — patches *(MUST)*

Three sources, because no single one is complete. **State the limits in the output, not just
the docs.**

1. **`Get-HotFix` / `Win32_QuickFixEngineering`** *(MUST)*. **The trap:** CBS-registered
   hotfixes only; shows the *latest cumulative update* rather than everything inside it;
   `InstalledOn` derives from a culture-dependent registry string that is frequently blank or
   wrong; misses Defender definitions, Store apps and much .NET servicing. **Corroboration,
   never the answer.**
2. **Windows Update Agent COM** *(MUST)* —
   `(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher().QueryHistory(0, N)`.
   Dates, titles, KB ids, ResultCode, `ClientApplicationID`. **Slow, and it hangs if the WU
   service is disabled.** Hard 30-second budget, then `timed-out`.
3. **`HKLM\…\WindowsUpdate\Auto Update\Results\{Detect,Download,Install}`** *(MUST)* — last
   successful timestamps. Cheap, never hangs.

Also:

- **Update source configuration** *(HIGH)* —
  `HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate[\AU]`: `WUServer`, `WUStatusServer`,
  `TargetGroup`, `UseWUServer`, `NoAutoUpdate`, `AUOptions`.
- **Management agents** *(HIGH)* — SCCM (`root\ccm` `SMS_Client`: version, site, MP),
  Intune/MDM (`dsregcmd /status`), third-party patchers.
- **.NET versions** *(HIGH)* — Framework `Release` DWORD from
  `HKLM\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full`; .NET Core/5+ runtimes **and
  SDKs** from `dotnet --list-runtimes` / `--list-sdks` or `C:\Program Files\dotnet\shared`.
- **Pending/missing updates** *(HIGH, `Deep` only)* —
  `IUpdateSearcher.Search("IsInstalled=0 and Type='Software'")`. Online scan: minutes of CPU
  and network per machine, and on some AU configurations it can initiate downloads. Not for a
  nightly fleet run.

### 8.4 `apps` — installed software *(MUST)*

Registry uninstall hives, all three:
`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*`,
`HKLM\SOFTWARE\WOW6432Node\…\Uninstall\*`, and
`Registry::HKEY_USERS\<SID>\…\Uninstall\*` for every **loaded** hive.

Keep `DisplayName`, `DisplayVersion`, `Publisher`, `InstallDate`, `InstallLocation`,
`EstimatedSize`, `WindowsInstaller`, architecture, **and the source hive**. Route
`SystemComponent = 1` and `ParentKeyName`-bearing child patches to a separate bucket rather
than dropping them.

> ### `Win32_Product` must never be called. Banned at every profile.
>
> Enumerating it triggers an MSI consistency check and **self-repair on every registered
> product** on the machine: minutes of runtime, `MsiInstaller` 1035/1004 reconfiguration
> events flooding the log, genuine state change including service restarts. It has
> reconfigured production applications in the field. It also only sees MSI installs, missing
> EXE/Squirrel/ClickOnce/portable apps. **On a daily scheduled job across two dozen machines
> this would be actively harmful.** Put the ban in a code comment where someone would
> otherwise add it.

- **Per-user installs** — record the owning SID. Loaded-hive enumeration is free and safe;
  `reg load` of unloaded profiles is `Forensic` only.
- **Unregistered app directories** *(HIGH)* — depth-2 listing of `C:\Program Files*`,
  `C:\Apps`, and non-system drive roots, matched against the uninstall list.
- **Binary provenance for in-house apps** *(HIGH)* — `FileVersion`, `ProductVersion`,
  `CompanyName`, `ProductName`, Authenticode signer + status, SHA-256, `LastWriteTime`, over
  **service binaries and one level of each IIS site's `bin\`**. Bounded — not a disk crawl.
- **Runtimes broken out** *(HIGH)* — VC++ redists, Java (vendor + version), Python, Node.
- *(NICE)* `Get-AppxPackage -AllUsers` on client SKUs; package managers (choco, winget,
  scoop, global npm). `Deep`, they shell out and can hang.

### 8.5 `features` — Windows roles and features *(MUST)*

Branch on `InstallationType`; do not try/catch your way there.

- Server SKU → `Get-WindowsFeature` (Name, DisplayName, InstallState, FeatureType, Parent).
  **This cmdlet does not exist on Windows 10/11.**
- **Always also** → `Get-WindowsOptionalFeature -Online`.

They are **different vocabularies over overlapping sets** (`Web-Server` vs
`IIS-WebServerRole`) and neither is complete alone. Emit both into one collection with a
`source` field; **never pick one.** On client SKUs only the DISM view exists.

Derived flags worth flattening for convenience: IIS present, **SMB1 enabled**, Hyper-V,
DNS/DHCP/ADDS, File Services, WSUS, RDS role, Failover Clustering, MSMQ, .NET 3.5.

*(NICE)* `Get-WindowsCapability -Online` — RSAT, OpenSSH server.

### 8.6 `iis` *(MUST)*

> **Scope pared and ratified 2026-08-07.** The original spec for this section was a full IIS
> inventory. It has been cut to the facets actually consulted in daily use, plus the two edge
> kinds needed to map dependencies later. What was cut — and why each piece can come back
> cheaply — is recorded in §8.6.10. This is a deliberate narrowing, not a gap.

**Parse `%windir%\System32\inetsrv\config\applicationHost.config` as XML directly.**
`WebAdministration` / `IISAdministration` are **not installed on the dev box** and their
availability varies by IIS version; the `IIS:` drive is slow, flaky under remoting and quirky
about inherited config. Fallback `appcmd list <obj> /config /xml`. Precondition:
`HKLM\SOFTWARE\Microsoft\InetStp` exists (also yields `VersionString`, `MajorVersion`,
`PathWWWRoot`).

#### 8.6.1 The payload is application-shaped, not site-shaped

Every facet consulted in daily use — physical path, runtime, pool identity, authentication,
what it talks to — is a property of an **application**, not a site. The v1 payload had no
application concept at all, which made "where is X installed and what does it run as" a
three-way join in the reader.

So `applications` is the primary collection, and the pool facts are **denormalized onto each
application row** as well as kept in `appPools`. The duplication is deliberate: one row
answers the question. Sites keep only what is genuinely site-level — state, bindings, log
configuration. Pools stay a separate collection because one pool serves many applications.

```json
{
  "server":       { "versionString": "10.0", "majorVersion": 10, "pathWwwRoot": "…",
                    "configPath": "…", "configLastWriteUtc": "…", "configSha256": "…" },
  "sites":        [ { "name": "…", "id": 1, "state": "Started", "physicalPath": "…",
                      "bindings": [ … ], "logFile": { … } } ],
  "appPools":     [ { "name": "…", "managedRuntimeVersion": "v4.0",
                      "managedPipelineMode": "Integrated",
                      "identityType": "ApplicationPoolIdentity", "userName": null } ],
  "applications": [ { "siteName": "…", "path": "/api", "physicalPath": "…",
                      "applicationPool": "…", "poolManagedRuntimeVersion": "",
                      "poolIdentityType": "SpecificUser", "poolUserName": "CORP\\svc-api",
                      "enabledProtocols": "http",
                      "runtime": { … }, "auth": { … },
                      "virtualDirectories": [ … ], "status": "ok" } ],
  "dependencies": [ { "siteName": "…", "appPath": "/api", "kind": "database", … } ]
}
```

#### 8.6.2 Server, sites, bindings

**Server** — `VersionString`, `MajorVersion`, `PathWWWRoot` from `InetStp`, plus
`applicationHost.config`'s path, `LastWriteTime` **and SHA-256**. Both, not just the mtime: a
file copy or a config-history restore rewrites mtime without changing content, and the hash is
what makes "did anything change on this web server" a single field compare (§6.3).

**Sites** — Name, Id, State, root physical path.

> **Trap: a site's physical path is not an attribute of `<site>`.** It lives on the root
> application's root `<virtualDirectory path="/">`. Reading `<site>` for it yields nothing.

**Bindings** — keep the raw `bindingInformation` **and** parsed `ip` / `port` / `hostHeader`,
alongside `sslFlags`, `certificateHash`, `certificateStoreName` (the last feeds the §8.7 join,
as it already does today). The raw string stays because it is the diff-stable form; the parsed
fields are what make "what is on port 8080 across the estate" and "where does
`foo.corp.local` live" real queries instead of string matching in the reader.

> **Trap: `bindingInformation` is not one shape.** For http/https it is `ip:port:hostHeader`
> where `ip` is `*` for all-unassigned and `hostHeader` is frequently empty. For `net.tcp`,
> `net.msmq` and `net.pipe` it is a completely different grammar (`808:*`). **Parse only when
> the protocol is http or https**; leave the parsed fields null otherwise rather than
> producing garbage.

#### 8.6.3 App pools

`Name`, `managedRuntimeVersion`, `managedPipelineMode`, and from `processModel`:
`identityType` and `userName`. **Never the password** (§6.7).

`managedRuntimeVersion` vocabulary — this is the field that answers "what runtime":

| Value | Meaning |
|---|---|
| `v2.0` | .NET Framework 2.0/3.5 CLR. Out of support; a finding on sight. |
| `v4.0` | .NET Framework 4.x CLR. |
| `""` | **No Managed Code** — ASP.NET Core, static content, or a non-.NET handler. Not "unmanaged" in the C++ sense. |

`identityType` vocabulary: `ApplicationPoolIdentity` (the default, a virtual
`IIS AppPool\<name>` account), `NetworkService`, `LocalSystem`, `LocalService`, or
`SpecificUser` — in which case `userName` is populated. **`SpecificUser` with a domain account
is the row that matters**: that is a credential living in the estate with a rotation
obligation attached.

`managedPipelineMode` (Integrated / Classic) is a second attribute on an element already being
read — included as a freebie, because Classic is the reason managed modules stop seeing static
requests.

#### 8.6.4 Applications and virtual directories

Per application: `siteName`, `path`, `applicationPool`, `enabledProtocols`, `physicalPath`.
Per virtual directory: `path`, `physicalPath`, `userName` (never the password), `logonMethod`.

> **Trap: the application's physical path is not on `<application>` either.** It is on the
> child `<virtualDirectory path="/">`. An application with extra vdirs has several children;
> only the `/` one is the application root.

> **Trap: every site has an implicit root application at path `/`.** It must be emitted as an
> application row, or the most common case in any estate — a site with no sub-applications —
> produces zero rows and the site looks empty.

Physical paths routinely contain `%SystemDrive%` and other environment variables. **Expand
them, and keep the raw form alongside**, so a variable that could not be expanded is visible
rather than silently wrong.

A `physicalPath` starting `\\` is a **UNC dependency** — it contributes to §8.9's
`uncDependencies`, and under remoting its free space is a double-hop and unavailable.

#### 8.6.5 Runtime marker — .NET Framework vs .NET Core

> **`web.config` vs `appsettings.json` is not an either/or.** An ASP.NET Core application
> hosted in IIS has **both** — the ASP.NET Core Module writes a `web.config` carrying the
> `<aspNetCore>` element. Testing for file presence alone classifies every Core app as
> Framework.

Three independent signals, all recorded raw. The collector does not pick a winner (CD-5).

| Signal | Source | Cost |
|---|---|---|
| `poolManagedRuntimeVersion == ""` | applicationHost.config | free |
| `<aspNetCore processPath= arguments= hostingModel=>` present | the app's `web.config` | already open |
| `appsettings.json` and/or `*.runtimeconfig.json` in the app root | directory probe | one stat |

Also captured from `<aspNetCore>` when present:

- `hostingModel` — `inprocess` vs `outofprocess`.
- `processPath` — `dotnet` means framework-dependent; a bare `.exe` means self-contained.
- `<environmentVariables>` — **`ASPNETCORE_ENVIRONMENT` is a stage signal**, and a production
  site running as `Development` is a finding in its own right (it turns on the developer
  exception page).

The verdict is rendered by the reader. Frozen into the payload it would be un-revisable when
the classification rule improves.

#### 8.6.6 Authentication — two sources, merged, with the winner recorded

`anonymousAuthentication` (enabled, `userName`) and `windowsAuthentication` (enabled) per
application. Basic and digest are recorded when present, since they are the same element read.

> **Trap: `windowsAuthentication` is a locked section by default.** When it is set through IIS
> Manager, IIS writes it into `applicationHost.config` under `<location path="Site/App">` —
> **not** into the application's `web.config`. Estates that have unlocked the section put it in
> `web.config` instead. Reading only one source silently reports the wrong answer for half the
> applications.

Merge in IIS's own order: server defaults under
`<system.webServer><security><authentication>` → `<location path="…">` overrides in
`applicationHost.config`, longest matching path wins → the application's own `web.config`
where the section is unlocked. Each authentication field carries a `source`
(`serverDefault` / `location` / `webConfig`) per §6.6, so configuration merely **moving
between files** does not read as a state change in the diff.

Anonymous enabled **and** Windows enabled simultaneously is legal and common — anonymous wins
unless authorization rules deny. Record both; **never collapse them into a single "auth
mode"**, which is exactly the kind of lossy classification CD-5 forbids.

#### 8.6.7 Dependency edges — databases and downstream URLs

The purpose of collecting these is to build a dependency map later, so they are emitted as a
**flat `dependencies` collection keyed to (site, application)** rather than nested inside each
config file's payload. A graph builder then consumes one array, and a diff has one stable key.

| Source | Yields |
|---|---|
| `connectionStrings` in `web.config` (with `providerName`) | `database` edges |
| `ConnectionStrings` section in `appsettings.json` | `database` edges |
| `appSettings` **values that parse as an absolute http(s) URL** | `http` edges |
| any string value in `appsettings.json` parsing as an absolute http(s) URL, at any depth | `http` edges |
| `system.serviceModel/client/endpoint@address` | `http` edges (WCF clients) |

**A deliberate carve-out from the "appSettings keys only" rule.** URL-shaped values are
captured because they *are* the dependency map; every other appSettings value stays keys-only
and `Deep`. A value is captured only if it parses as an absolute `http`/`https` URI.

**Both edge kinds are parse-and-drop (§6.7). The raw string is discarded at the point of
collection and never reaches disk.**

##### Database edges

`{ name, provider, host, instance, port, database, authMode, encrypt,
trustServerCertificate, isLocal, secretsPresent, sha256 }`.

- **Every name is captured, including `DefaultConnection`.** Filtering at collection time is
  irreversible, and a real `DefaultConnection` pointing at a production database is precisely
  the finding worth having. Suppress it in the reader if it is noise there.
- **Server-value normalization is what makes the graph work.** `.`, `(local)`, `localhost`,
  `127.0.0.1` and `(localdb)\…` all mean *this machine* — resolve them to the collecting
  machine's name and set `isLocal`, **or every local reference across the estate collapses
  onto one fake shared node.** `SQLPROD01\INST` splits into host + instance.
  `tcp:sql.corp.local,1433` splits into protocol + host + port.
- `AttachDbFilename` or a bare `.mdf` path is a **file** edge, not a server edge. A LocalDB
  attachment is not a dependency on a database server.
- Non-SQL providers (Oracle, MySQL, PostgreSQL, an ODBC DSN) get `provider` recorded and
  best-effort host extraction. Where the shape is not understood, emit `host: null` with
  `parseStatus: "unrecognized"` rather than guessing — unknown is never absent (§6.2).

##### HTTP edges

`{ scheme, host, port, path, source, key, isLocal, hadCredentials, hadQuery, sha256 }`.

- **Strip userinfo and the query string.** Both `https://user:pass@host/` and `?api_key=…`
  carry secrets. Record `hadCredentials` / `hadQuery` as booleans so the *fact* survives
  without the value.
- **Trap: XML namespace and schema URIs will flood the graph.**
  `http://schemas.xmlsoap.org/…`, `http://www.w3.org/…`, `http://schemas.microsoft.com/…` and
  `http://tempuri.org/` appear throughout every `web.config`. Scan **only** the element sets
  named in the table above — never attribute values generally, and never `xmlns` — and apply a
  well-known-schema host denylist on top of that.
- `localhost` / `127.0.0.1` URLs are self-edges. Normalize them the same way as database hosts
  and flag them; **do not discard them.** A site calling a service on its own box is still a
  dependency, just a local one.
- Joining an edge's host back to IIS bindings elsewhere in the estate is what turns these rows
  into a graph — and that join is a reader concern, not the collector's.

##### Resolution asymmetry — the source is resolved, the target is a claim

Census is standing on the source machine, so it resolves the source strongly: this machine,
this site, this application. **The target is a string read out of a config file and
normalized. Nothing more.** State it in the payload; do not let a consumer infer symmetry that
is not there. See `.docs/features/graph-interop.md` §6.

- **Unresolved targets are first class and are never dropped.** A connection string pointing at
  `SQLPROD07` is a valid and valuable edge even when census has no access to `SQLPROD07` and
  never will. A downstream model very likely holds that node from manual entry — supplying
  that edge is the contribution census is making.
- **No DNS resolution and no reachability probe on an edge target, ever.** It is network I/O
  per edge, it can hang, and split-horizon DNS means the answer depends on *where* you resolve
  from — which is the consumer's context, not the collector's. Recorded as a decision so it is
  not added later as an improvement.
- **The normalization algorithm is part of the collector's `version` contract** (§6.5).
  Changing how a host string is normalized changes every edge key derived from it, which
  churns matching in a consumer census does not control. That is a version bump, not a patch.

#### 8.6.8 Log directories

Configuration from `<site><logFile>`, falling back to `<siteDefaults><logFile>`: `enabled`,
`directory`, `logFormat`, `period`, `truncateSize`, `logTargetW3C`.

> **Trap: `directory` is stored with `%SystemDrive%` unexpanded.** Expand it; keep the raw.

> **Trap: central logging overrides all of it.** `<log centralLogFileMode="CentralW3C">` (or
> `CentralBinary`) at server level means the per-site directories are inert and every site
> writes to one shared file. Capture `centralLogFileMode` and the central file's directory,
> and when the mode is not `Site`, mark the per-site log stats `not-applicable` rather than
> reporting paths nothing is writing to.

The resolved directory is `<expanded directory>\W3SVC<siteId>`. Derived per site:

| Field | Why it earns its place |
|---|---|
| `exists` | Logging enabled but the directory missing is a misconfiguration |
| `fileCount`, `totalBytes` | The disk-filling site. Joins against §8.9 drives: "logs are on C: and C: is at 4% free" |
| `oldestUtc`, `newestUtc` | A `newestUtc` weeks old on a "production" site means nobody is using it |
| `last24hBytes` | A free traffic proxy |
| `enumerationStatus`, `truncated` | See below |

Rules:

- **Metadata only.** `Length` and `LastWriteTime` off the directory enumeration. **No log file
  is ever opened or read.**
- **Bounded.** Cap the enumeration and set `truncated: true` when the cap is hit, rather than
  walking 26,000 files on an hourly-rotation site. **A silent cap would read as a shrinking log
  directory in the diff** — the flag is what prevents that (§6.6).
- **All of the derived fields are volatile** (§6.3) — `totalBytes`, `newestUtc`,
  `last24hBytes` and `fileCount` change every day by design, and must be excluded from the
  hashed projection. The *configuration* fields are not volatile and stay in the hash.
- A log directory on a UNC path is a double-hop under remoting:
  `enumerationStatus: "unavailable", reason: "double-hop"`, and the path contributes a UNC
  dependency edge (§8.9).

**This is the only new I/O in the pared scope beyond config-file reads** — one directory
enumeration per site.

#### 8.6.9 Error isolation is now mandatory, not optional

v1 read a single file, so one category-level `try/catch` was sufficient. The pared scope reads
**one `web.config` and one `appsettings.json` per application**, any of which can be missing,
malformed, or ACL'd. As written today a single throw takes the whole IIS category to `failed`
and loses every site that parsed fine.

- Per-application `try/catch`. Each application row carries its own `status` + `reason` from
  the §6.2 vocabulary.
- Category-level `failed` is reserved for **"could not read `applicationHost.config`"** — the
  one genuinely all-or-nothing failure.
- **A missing `web.config` is `not-present`, not `failed`.** A static site legitimately has
  none; that is a positive finding.

#### 8.6.10 Deliberately deferred

Cut from the original scope. All still valid, none scheduled — recorded here so the cut reads
as a decision rather than an oversight.

| Deferred | Note |
|---|---|
| `compilation debug="true"`, `customErrors mode="Off"` | **Cheapest remaining add** — the `web.config` is already open and parsed. Two XPath reads. |
| App pool `recycling` / `failure`, `idleTimeout`, `maxProcesses`, `queueLength`, `enable32BitAppOnWin64` | Free from the XML pass whenever wanted |
| Modules, handlers, ISAPI filters, `isapiCgiRestriction` | |
| URL Rewrite rules and ARR `webFarms` | **Also a dependency-edge source** — a rewrite or proxy target is a downstream edge exactly like an appSettings URL. The natural next increment for §8.6.7. |
| Site content signals — `.pdb` count, `*.sln`, `bin\Debug`, `App_Offline.htm` | A disk walk; needs a time budget |
| `machineKey`, `sessionState`, `targetFramework`, `httpRuntime` limits, trust level | |
| `appcmd list wp` (running w3wp per pool), `netsh http show urlacl` | Configured ≠ running |
| Shared configuration, Central Certificate Store | |
| `useAppPoolCredentials`, `extendedProtection`, Windows provider order | The classic Kerberos double-hop / SPN tell; capture verbatim if authentication work goes deeper |

`netsh http show sslcert` is **not** deferred — §8.7 already collects it.

### 8.7 `certs` — the whole machine store *(HIGH)*

`Get-ChildItem Cert:\LocalMachine\{My, WebHosting, Root, CA, Remote Desktop}`: Subject,
SAN/DnsNameList, Issuer, Thumbprint, SerialNumber, NotBefore, NotAfter, HasPrivateKey,
KeySize, SignatureAlgorithm, EKU list, FriendlyName, Archived, IsSelfSigned. **Never export a
key.**

- **The binding join** *(HIGH)*. For each thumbprint, is it bound to IIS (§8.6), HTTP.SYS,
  **SQL Server** (`…\MSSQLServer\SuperSocketNetLib\Certificate` + `ForceEncryption`), **RDP**
  (`Win32_TSGeneralSetting.SSLCertificateSHA1Hash`), or a **WinRM HTTPS listener**?
- **SCHANNEL protocol/cipher policy** *(HIGH)* —
  `HKLM\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols`: TLS
  1.0/1.1/1.2/1.3 and SSL 2.0/3.0 × Client/Server × Enabled/DisabledByDefault, plus `Ciphers`,
  `KeyExchangeAlgorithms`, cipher suite order.
- **.NET TLS behaviour** *(HIGH)* — `SchUseStrongCrypto` and `SystemDefaultTlsVersions` in
  **both** `HKLM\SOFTWARE\Microsoft\.NETFramework\v4.0.30319` and the `WOW6432Node` hive.
- *(NICE, `Deep`)* private-key ACLs — can hang on HSM/third-party CSPs; timeout and continue.

### 8.8 `sqlserver` *(MUST)*

**Discovery without connecting** — always, cheap, no SQL permission needed. Enumerate from
`HKLM\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL` — **not**
`Get-Service MSSQL*`. Per instance, `MSSQLxx.NAME\Setup` gives Edition, Version, PatchLevel,
SQLBinRoot, SQLDataRoot, Collation; `MSSQLServer` gives LoginMode (1 = Windows, 2 = Mixed),
BackupDirectory, DefaultData/DefaultLog; `SuperSocketNetLib\Tcp\IPAll` gives TcpPort /
TcpDynamicPorts, ForceEncryption, Certificate. Services `MSSQL$X` / `SQLAgent$X` give
StartName (the service accounts) and StartMode. Also detect SSRS, SSAS, SSIS, LocalDB, and
SSMS-installed-but-no-engine.

**Connected** — raw `System.Data.SqlClient`, `Integrated Security=SSPI`,
`Application Name=census`, short timeouts, catalog views only. `Execute-NativeSql` shape from
`Invoke-SqlMigrationController.ps1`. No `SqlServer` module.

| Group | Source | Pri |
|---|---|---|
| **Instance** | `SERVERPROPERTY`: ProductVersion, ProductLevel, ProductUpdateLevel (CU), Edition, EngineEdition, IsClustered, IsHadrEnabled, Collation, IsIntegratedSecurityOnly | MUST |
| **Databases** | `sys.databases`: name, state_desc, recovery_model_desc, compatibility_level, collation, is_read_only, is_auto_close_on, is_auto_shrink_on, is_encrypted, `SUSER_SNAME(owner_sid)`, create_date, log_reuse_wait_desc | MUST |
| **Database files** | `sys.master_files` — instance-wide, one query, no per-database context switch: database_id, type_desc, name, physical_name, size, max_size, growth, is_percent_growth | MUST |
| **Backups** | `msdb.dbo.backupset` ⋈ `backupmediafamily`: MAX(backup_finish_date) by type D/I/L, size, is_copy_only, physical_device_name. **LEFT JOIN *from* `sys.databases`** | HIGH |
| **Logins & sysadmins** | `sys.server_principals` ⋈ `sys.server_role_members`; `sys.sql_logins` policy flags (**never `password_hash`**) | HIGH |
| **Linked servers** | `sys.servers WHERE is_linked = 1` + `sys.linked_logins` (local principal + remote name, never the remote password) | HIGH |
| **Agent jobs** | `msdb.dbo.sysjobs` (name, enabled, owner), `sysjobsteps` (subsystem, command — sensitive), schedules, latest outcome per job | HIGH |
| **Configuration** | `sys.configurations`: max server memory, MAXDOP, cost threshold, xp_cmdshell, clr enabled, Ole Automation, backup compression | HIGH |
| **tempdb** | `sys.master_files WHERE database_id = 2` + `sys.dm_os_sys_info.cpu_count` | HIGH |
| **HA/DR** | `sys.availability_groups`, replica states, listeners, `sys.database_mirroring`, `sys.dm_os_cluster_nodes`, log shipping, replication flags | HIGH |
| **Host facts** | `sys.dm_os_sys_info`: start time, physical_memory_kb, cpu_count, hyperthread_ratio, LPIM; `sys.dm_server_services` (instant file initialization, service account) | HIGH |
| **Space used per file** | `FILEPROPERTY(name,'SpaceUsed')` — needs a per-DB loop | HIGH, `Deep` |
| **Database users & roles** | per-DB `sys.database_principals` + role members, orphaned users | HIGH, `Deep` |
| **Trace flags, errorlog path** | `DBCC TRACESTATUS(-1) WITH NO_INFOMSGS` | NICE |

Notes that matter:

- **Permissions, stated deliberately: `VIEW SERVER STATE` + `VIEW ANY DEFINITION` +
  `db_datareader` on msdb covers everything above except the per-database loops. Do not ask
  for `sysadmin`.**
- If msdb history has been purged the backup-recency figure lies — capture the history
  cleanup job and the oldest row, and flag it.
- Wrap every database in `TRY`/`CATCH` and skip offline / restoring / read-only-secondary
  databases, so one inaccessible database cannot kill the collector.

### 8.9 `drives` *(MUST)*

Three **separately labelled** sets. Never merged.

1. **Local volumes** — `Get-Volume` primary: UniqueId, DriveLetter, FileSystemLabel,
   FileSystemType, DriveType, HealthStatus, Size, SizeRemaining, Path. `Win32_LogicalDisk`
   only as a PowerShell-4.0 fallback. **`Win32_LogicalDisk` cannot see volumes mounted as
   folders** — add `Win32_MountPoint` / `Get-Partition` `AccessPaths` for mount points.
2. **Session mappings** — `Get-SmbMapping`. **Trap: `Win32_NetworkConnection` is useless
   remotely** — under WinRM or a service context it returns nothing at all, silently. Say
   this in the code comment. Sizes are `unavailable / double-hop`.
3. **Persistent mappings per user** — `Registry::HKEY_USERS\<SID>\Network\<letter>`
   (RemotePath, UserName, ProviderName) for every **loaded** hive. Unloaded profiles need
   `reg load` — `Forensic` only.

Also:

- **Physical disks** *(HIGH)* — `Get-PhysicalDisk` / `Get-Disk`: Model, MediaType (SSD/HDD),
  BusType, Size, HealthStatus, IsBoot.
- **SMB shares this machine serves** *(HIGH)* — `Get-SmbShare` + `Get-SmbShareAccess` +
  `Get-Acl` **on the share root only, never recursing**.
- **BitLocker** *(HIGH for laptops)* — `Get-BitLockerVolume`: ProtectionStatus,
  EncryptionMethod, key protector **types**. **Never recovery keys.**
- *(NICE)* `SUBST` drives from `HKLM\SYSTEM\CCS\Control\Session Manager\DOS Devices`; dedup;
  Storage Spaces pools.

**`uncDependencies`** — every collector that emits a path (IIS vdir physical paths, service
binary paths, scheduled-task working directories, SQL backup directories and
`sys.master_files` paths, share definitions, hosts-file entries) contributes to one
`uncDependencies` collection keyed on `\\server\share` with a `sourceKind` field, alongside
the three drive sets above.

### 8.10 `memory` *(MUST)*

`Win32_ComputerSystem.TotalPhysicalMemory`, the sum of `Win32_PhysicalMemory.Capacity`, and
`Win32_OperatingSystem.TotalVisibleMemorySize`. **Record all three** — they legitimately
disagree (hardware reservation, VMs reporting synthetic or absent DIMMs) and the discrepancy
is itself informative. **Do not pick a winner in the collector.**

*(HIGH)* DIMM detail: Capacity, Speed, DeviceLocator, plus `Win32_PhysicalMemoryArray`
MaxCapacity and slots used vs total. *(NICE)* page file size and location; free physical
memory as a volatile field (excluded from the hash).

### 8.11 `services` *(HIGH)*

**`Get-CimInstance Win32_Service`, not `Get-Service`** — the latter exposes neither
`StartName` nor `PathName`.

Name, DisplayName, PathName (binary + args), StartMode, State, **StartName** (the logon
account), ServiceType, DelayedAutoStart, Description, ProcessId, ExitCode.

*(HIGH)* **Running processes** — `Win32_Process`: Name, ExecutablePath, **CommandLine**,
ParentProcessId, StartTime. Sensitive: command lines occasionally carry credentials.

*(NICE)* `sc.exe qfailure` recovery actions; COM+ applications and their identities.

### 8.12 `tasks` — scheduled tasks *(HIGH)*

`Get-ScheduledTask` + `Get-ScheduledTaskInfo`: TaskName, TaskPath, State, Author, Principal
(UserId, LogonType, RunLevel), Actions (Execute, Arguments, WorkingDirectory), Triggers,
LastRunTime, LastTaskResult, NextRunTime. `schtasks /query /fo csv /v` as the 2008 R2
fallback.

Exclude `\Microsoft\Windows\*` by default but **report the count**. Action arguments are
sensitive.

### 8.13 `network` *(HIGH)*

`Get-NetIPConfiguration` / `Get-NetAdapter` / `Win32_NetworkAdapterConfiguration`: adapters
(Name, InterfaceDescription, MacAddress, LinkSpeed, Status), IPv4/IPv6 addresses,
PrefixOrigin (Dhcp vs Manual), gateway, DNS servers, DNS suffix, DHCP server + lease.

- **Listening TCP/UDP endpoints joined to the owning process path** *(HIGH)* —
  `Get-NetTCPConnection -State Listen` ⋈ `Win32_Process` on `OwningProcess`; `netstat -ano`
  fallback.
- **hosts file** *(HIGH)* — non-comment entries. Sensitive.
- **Firewall profiles** *(HIGH)* — `Get-NetFirewallProfile`: enabled state, default inbound
  action, logging.
- **SMB config** *(HIGH)* — `Get-SmbServerConfiguration` / `Get-SmbClientConfiguration`: SMB1
  enabled, signing required, encryption.
- *(HIGH, `Deep`)* full firewall rules with port + address filter joins — filter to
  non-built-in by default.
- *(NICE)* NIC teaming; `netsh winhttp show proxy`; WinRM listener config.

### 8.14 `security` *(HIGH)*

- **Local Administrators membership** *(HIGH)* — **`Get-LocalGroupMember` throws on orphaned
  / unresolvable SIDs and kills the whole collector** — fall back to ADSI `WinNT://` or `net
  localgroup`. Also collect Remote Desktop Users, Backup Operators. Sensitive.
- **Local accounts** *(HIGH)* — `Get-LocalUser` / `Win32_UserAccount WHERE
  LocalAccount=True`: Enabled, SID (RID 500 detection), LastLogon, PasswordLastSet,
  PasswordNeverExpires.
- **LAPS** *(HIGH)* — legacy AdmPwd CSE installed, Windows LAPS policy, last rotation. **Never
  the password.**
- **AV / EDR** *(HIGH)* — **`root\SecurityCenter2\AntiVirusProduct` exists on client SKUs
  only** — absent on Server. On Server use `Get-MpComputerStatus` / `Get-MpPreference`, plus
  service-name detection for CrowdStrike (`CSFalconService`), SentinelOne, Sophos, Symantec,
  Trend, Carbon Black. Defender exclusions — sensitive.
- **RDP** *(HIGH)* — `fDenyTSConnections`, **`UserAuthenticationRequired`** (NLA),
  SecurityLayer, port, bound cert thumbprint.
- **UAC / credential hygiene** *(HIGH)* —
  `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System`: `EnableLUA`,
  `ConsentPromptBehaviorAdmin`, `LocalAccountTokenFilterPolicy`, `FilterAdministratorToken`.
  Plus WDigest `UseLogonCredential`, `LmCompatibilityLevel`, LSA `RunAsPPL`, Credential Guard.
- *(NICE)* PowerShell v2 engine enabled, `Get-ExecutionPolicy -List`, script-block
  logging/transcription. `auditpol` at `Deep`; `secedit /export` at `Forensic` (writes a temp
  file).

### 8.15 `usage` — dev-box signals, collected raw *(HIGH)*

These are **raw signals only** — the script records them; scoring which machine "is" a dev
box is a downstream (reader) concern and is out of scope here.

| Signal | Acquisition |
|---|---|
| .NET SDK or Visual Studio / Build Tools installed | `dotnet --list-sdks` (SDK ≠ runtime), `vswhere.exe -all -format json` for products/versions/workloads, or the software list |
| User profiles present and recently used | `Win32_UserProfile`: LocalPath, SID, LastUseTime, Special, Loaded, RoamingConfigured |
| Dev tooling | software list: VS Code, Rider/ReSharper, Git for Windows, Tortoise*, Node, Python, Docker Desktop, Postman, Fiddler, LINQPad, Azure Data Studio, NuGet CLI |
| SQL Developer/Express, LocalDB, database files under a user profile path | §8.8 + `physical_name` prefix match |
| `.pdb`s / `debug="true"` / `*.sln` in a served app root | §8.6 |
| Office / Outlook / Teams / browsers on a Server OS | software list |
| Source-control working folders | depth ≤ 4, time-budgeted scan of `C:\Users\*`, `C:\src`, `C:\dev`, `C:\git`, non-system drive roots for `.git`, `.vs`, `*.sln`, `node_modules`. Excluded: `%WinDir%`, Program Files, SQL data dirs, any network path. Counts and top paths only, never contents. `Deep`. Paths are sensitive |
| Interactive logon history | Security 4624 type 2/10, `Get-WinEvent -FilterHashtable` with `-MaxEvents` and a bounded window. `Deep` opt-in, skip DCs |

### 8.16 `hosted` — non-IIS applications *(HIGH)*

| Target | Acquisition |
|---|---|
| Custom Windows services | §8.11 ⋈ §8.4 binary provenance |
| Kestrel / self-hosted .NET | `Win32_Process` CommandLine matching `dotnet *.dll`, or an `.exe` with an adjacent `*.runtimeconfig.json`; `ASPNETCORE_URLS` / `ASPNETCORE_ENVIRONMENT`; `netsh http show urlacl`; listening ports with non-IIS owners |
| Node | `node.exe` processes + CommandLine, `iisnode` handler in IIS config, `package.json` in app dirs |
| Java / Tomcat / JBoss | `java.exe`/`javaw.exe` processes, `JAVA_HOME`, `Tomcat*` services, catalina paths, vendor + version |
| Apache / nginx on Windows | `httpd.exe` / `nginx.exe` services and processes |
| Queues & caches | MSMQ (feature + private queues), RabbitMQ, Redis, ActiveMQ, Kafka |
| WCF via WAS | IIS `enabledProtocols` containing `net.tcp` / `net.msmq` / `net.pipe`; `system.serviceModel` |
| Platform products | SSRS (`rsreportserver.config` URLs), SSIS catalog, BizTalk, SharePoint, Exchange, ADFS |
| Machine environment variables | `Win32_Environment` / `HKLM\SYSTEM\CCS\Control\Session Manager\Environment`. Keys always; values `Deep` + sensitive |

### 8.17 Explicitly out of scope, and why

- **`Win32_Product`** — destructive (§8.4). Banned.
- **Decrypting protected config sections** — turns an inventory tool into an exfiltration
  tool.
- **Any write on a target machine** — no temp files, no registry writes, no service starts.
  Two exceptions are `Forensic`-only and must be argued individually: `reg load`, and
  `secedit /export`.
- **Performance sampling.** Census is structural; utilization belongs to a monitoring system.
  *(Do keep one free point-in-time snapshot — free RAM, uptime, top-5 processes by working
  set — because a 4 GB box running SQL and IIS is a finding needing no sampling.)*
- Full-disk enumeration, whole-registry export, unbounded event-log dumps.
- Certificate private keys, app-pool passwords, raw connection strings, LAPS/BitLocker
  secrets, product keys — never, at any profile.
- **Classification, scoring, and reports** — deliberately out of scope for this script; see
  `.docs/plan.md` §9–§10 if that later becomes its own project.

---

## 9. Build order

Each slice is verified before the next starts.

**Slice 0 — pre-flight only.** `Invoke-Census.ps1 -PreFlightOnly` against the real list.
*Verify:* a transport report saying, per machine, resolvable / port open / WinRM answering /
admin rights. Do not fold this into a later slice.

**Slice 1 — collector core, local only** (`identity`, `os`, `memory`, `drives`).
*Verify:* run on the dev box, get a valid envelope, all `ok`. Then run as a non-admin and
confirm graceful `insufficient-rights` rather than a stack trace. Confirm 5.1 compatibility
via `powershell.exe -File`. **Also prove the localhost-SQL no-double-hop assumption against
one real remote box** — everything in §8.8 depends on it.

**Slice 2 — fan-out and file layout.** `Invoke-Command -FilePath` over the passing set,
per-machine wall-clock timeout, files at `<root>\<MACHINE>\census-YYYYMMDD.json`, run
manifest in `_runs\`. *Verify:* three machines with one deliberately powered off — manifest
shows 2 ok / 1 unreachable, the run does not hang, and re-running the same day overwrites
cleanly.

**Slice 3 — remaining collectors.** In this order — cheapest and least likely to hang first:
`features` → `services` → `apps` → `network` → `tasks` → `security` → `iis` (+ `certs`) →
`sqlserver` → `hosted` → `usage` → **`updates` last** (it is the one that hangs).
*Verify:* every collector tested on both a box that has the subject and a box that lacks it.
The dev box has neither IIS nor SQL Server, so it is the natural fixture for both.

**Then `aliases` (§8.1.1) as a post-pass**, after all of them — it aggregates from `iis`,
`certs`, `sqlserver` and `network`, so it cannot be ordered among them. *Verify:* with `iis`
deliberately failed, the alias set is smaller **and** records which sources contributed,
rather than silently shrinking.

**Slice 4 — scheduled job.** Register the daily task; let it run unattended overnight.
*Verify:* next morning there is one new file per reachable machine, a run manifest, and the
previous day's files are untouched.

**Slice 5 — aging.** Gzip files older than N days.

---

## 10. Open items

- **Machine list provenance** — hand-maintained `machines.json`, or generated from AD
  `Get-ADComputer` / a CMDB? Determines whether "never seen" is meaningful in the run
  manifest. Note the `ActiveDirectory` module is not on the dev box.
- **Bucket taxonomy** — buckets are credential scopes today. Confirm that's all they need to
  be for this script; adding a reporting facet (environment, owning team, site) is a later,
  separate decision that doesn't block the collector.
- **Census root location** — UNC share vs local to the control box. Recommendation: a config
  value from day one, ACL'd to the census account and admins. **This tree is considerably
  more sensitive than an IIS log tree** — treat the root as tier-0: restricted ACL, no email
  exports, no ad-hoc copies.
- **Retention** — how long before daily files are gzipped, and before they are deleted.
  Position: gzip at 30 days, keep indefinitely (volume is trivial at this scale), but make it
  a decision rather than an accident.
- **PowerShell floor** — is Server 2012 R2 (PowerShell 4.0) in scope? Costs four fallback
  code paths (§7.1), and the fallbacks must not read as change in the diff (§6.6).
- **Script signing** — if the estate enforces `AllSigned`, `-FilePath` transfer and the
  portable collector need a code-signing certificate.
- **SQL permissions** — will the instances grant `VIEW SERVER STATE` + `VIEW ANY DEFINITION`
  + msdb read to the census account? Determines how often `sqlserver` degrades to
  `insufficient-rights`. **Do not ask for `sysadmin`.**
- **Per-user hive depth** — persistent mapped drives and per-user installs for *logged-off*
  users need `reg load` of `NTUSER.DAT`. Position: **loaded hives only**, gap declared in the
  envelope. `Forensic` only if ever enabled, with a guaranteed `finally` unload.
- ~~**Connection strings**~~ — **resolved 2026-08-07.** Parse-and-drop ratified (§6.7), and
  extended to downstream http(s) URLs on the same terms. Both are collected as dependency
  edges (§8.6.7) because mapping application dependencies is the reason they are wanted at
  all. `DefaultConnection` is **not** filtered at collection — suppression is a reader
  concern, because filtering here is irreversible.
- **Log enumeration cap** — §8.6.8 bounds the per-site log directory walk and flags
  `truncated`, but the cap itself is unset. Needs one real site with a large log directory to
  pick a number against. Position: high enough that it never fires on daily rotation.
- **Binding host → estate join** — §8.6.7 http edges are matched to IIS bindings by host name
  by the reader. Whether that join should also resolve DNS (CNAMEs, load-balancer VIPs, and
  split-horizon all break naive name matching) is a reader decision, not a collector one, but
  it determines whether the collector should also capture a resolved address per binding.
- **ARR / URL Rewrite as an edge source** — deferred in §8.6.10, but a proxy target is a
  downstream dependency exactly like an appSettings URL. Revisit once the first dependency map
  is rendered and the gaps in it are visible.
- **Export endpoint** — `.docs/features/graph-interop.md` §5 commits `Census.Web` to a
  versioned read-only export so no consumer binds to the output file tree. That is a web-side
  work item, not a collector one, and is not yet reflected in
  `.docs/features/census-web.md`. Its open items (transport, authentication, cadence, whether
  the consumer wants raw envelopes or a projection) live in graph-interop §10.

---

## 11. Decisions to record in `.docs/spec/decisions.md`

| | Decision |
|---|---|
| **CD-1** | One collector, executed locally, shipped in by `-FilePath`; portable build as fallback. No agent, no remote CIM. |
| **CD-2** | Collector status vocabulary, and the invariant that unknown is never absent. |
| **CD-3** | Full snapshot per machine per day; IIS-log-style tree; absence is signal. |
| **CD-4** | Per-collector hash with a volatile-field exclusion list; named diff keys per collection. |
| **CD-5** | The collector observes only; it does not classify or score. |
| **CD-6** | No CredSSP; no secret capture at any profile; connection strings parse-and-drop. |
| **CD-7** | `Win32_Product` banned outright; no writes on target machines. |
| **CD-8** | Windows PowerShell 5.1 floor; fallback paths recorded in the payload. |
| **CD-9** | Credential buckets from day one; `task-identity` as the default kind. |
| **CD-10** | The IIS payload is application-shaped, not site-shaped; pool facts are denormalized onto each application row. Scope pared to the daily-use facets (§8.6), with the cut recorded rather than dropped. |
| **CD-11** | Dependency edges — databases and downstream URLs — are a flat, keyed collection, parse-and-drop, with hosts normalized so local aliases (`.`, `localhost`, `(localdb)`) never collapse the estate onto one fake node. Collected because mapping dependencies is the goal; the graph join itself is a reader concern. |
