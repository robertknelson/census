# Census — Collection Spec

> **Status:** design, not yet built. `C:\github\ai\census` is empty apart from `.trail-boss\`.
> **Scope of this document:** phase 1 only — the PowerShell collector and the JSON contract.
> Phase 2 (the reader app) is described only where it constrains phase 1.
>
> **On approval, this file lands at `C:\github\ai\census\.docs\census-collection.md`.**
> It is written to be self-contained: a session starting from scratch with only this file
> and the repo should be able to build the thing.

---

## 1. Context

There is an enumerated list of Windows machines — servers and laptops, some physical, some
virtual — and no reliable record of what is on them. Machines were provisioned by role but
have drifted. VMs built on Windows Server are in daily use as developer workstations. Web
servers have accumulated sites nobody registered. Database servers have data files in
places nobody chose.

The estate needs a census: what OS, what patches, what software, what Windows features,
and — where they exist — the full IIS and SQL Server configuration, plus drives and RAM.
Machines get **categorized by OS and by usage, with usage inferred from what is installed.**

The project is in two halves. **This document covers only the first.**

1. **Collection (here).** One PowerShell script reads a JSON list of machines, executes
   remotely against each, and writes one JSON census document per machine per day to the
   filesystem — laid out the way IIS log files are, a folder per machine with daily files
   inside. Run by a Task Scheduler job, once a day.
2. **Reading (later, separate project).** An app in the mould of `LogExplorer`
   (`C:\github\ai\LogExplorer`) that points at that tree, scans it, and turns it into
   browsing, classification, drift and reporting.

Because the reader does not exist yet, **the JSON envelope is the deliverable that matters
most.** Everything in phase 2 is downstream of it, and unlike the script, it is expensive
to change once a year of daily files exists. This document therefore treats the envelope
schema as the primary artifact and the script as its producer.

### Scale and reach

- **A couple of dozen machines** to start. Small enough that reliability beats throughput.
- **A single account** reaches everything today. The design carries a credential-bucket
  seam anyway (§5.2) because it is nearly free now and expensive to retrofit later.
- Fan-out is throttled parallel purely to keep the nightly window short. **Nothing in the
  design may depend on concurrency** — sequential must remain a valid mode.

---

## 2. Prior art

| Source | What is taken |
|---|---|
| `C:\github\ai\LogExplorer\sample-logs\`, `.docs\features\metadata-spine.md` | On-disk layout: `<root>\<MACHINE>\<datestamped file>`, `.gz` for aged files, filename-encoded dates, directory listing as the index. The phase-2 reader will scan a census tree the way `LogFileScanner` scans a `W3SVC` folder. |
| `C:\github\ai\LogExplorer\.docs\features\log-sources-v2.md` | Flat records with free-string facets rather than a rigid hierarchy. Also the `PathGuard` containment pattern for a user-supplied root. |
| `C:\github\ai\LogExplorer\.docs\features\security.md` | `Security:AllowedRoots` containment; Windows/Negotiate auth for the future reader. |
| `C:\github\ai\ai-sql-mover\scripts\Invoke-SqlMigrationController.ps1` | The PowerShell shape: `param()` + `-Execute` switch for dry-run vs live, structured `[ordered]@{}` log records appended to a JSON log, per-item `try/catch` nested inside a controller `try/catch`, and `Execute-NativeSql` using raw `System.Data.SqlClient` with `Integrated Security=True` — **no `SqlServer` module dependency.** |
| `C:\github\ai\LogExplorer\tools\generate-sample-logs.ps1` | PS style: comment-based help header, `param()` block, `$ErrorActionPreference = 'Stop'`, `# --- section ---` dividers, PascalCase params, camelCase locals. |
| `C:\github\ai\app-graph\.docs\design\apptrak-import.md` | Provenance discipline — every asserted fact carries what asserted it and the evidence it cites. |
| `C:\github\ai\app-graph\db\002-appgraph-seed-ontology.sql` | Naming alignment (`Server` / `AppPool` / `ServiceAccount` / `Certificate` / `WebApp` / `Database` / `DatabaseInstance` / `DbUser`) so a later export into `appgraph` is a mapping, not a translation. |

### Verified on the dev box (2026-07-31)

- `pwsh` **7.6.3** and Windows PowerShell **5.1** both present.
- `WebAdministration`, `IISAdministration`, `SqlServer`, `ServerManager`, `ActiveDirectory`
  modules **not available**. `Storage` and `SmbShare` are in-box.
- WinRM service **Stopped**; `TrustedHosts` not readable unelevated.
- No IIS and no SQL Server locally — which makes this box the natural **`not-present`
  fixture** for both collectors.

These findings settle two mechanism choices below: IIS is read from `applicationHost.config`
as XML, and SQL Server through raw `System.Data.SqlClient`.

---

## 3. Repository layout

```
census/
  Invoke-Census.ps1              # orchestrator — reads machines.json, fans out, writes files
  Get-MachineCensus.ps1          # runs ON the target, returns one JSON string
  Build-Collector.ps1            # concatenates into a standalone portable collector
  collectors/                    # identity os updates apps features services tasks network
                                 # iis certs sqlserver drives memory security usage
  config/
    machines.json                # the enumerated list + credential buckets (operator-owned)
    census.config.json           # root path, throttle, timeouts, profile, retention
    lifecycle.json               # OS / SQL / .NET end-of-support dates, versioned data
    creds/                       # DPAPI .cred.xml files — git-ignored, never committed
  tools/
    New-SampleCensus.ps1         # fixture generator, mirrors generate-sample-logs.ps1
  .docs/
    census-collection.md         # this file
    spec/decisions.md            # CD-1..CD-n with rationale
    features/*.md                # envelope, collectors, layout, classification
```

---

## 4. Output layout

Deliberately isomorphic to an IIS log tree, because the phase-2 reader is modelled on
`LogExplorer` and should be able to scan it the same way.

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
- **Full snapshot every day, not deltas.** Any single file is a complete, self-describing
  census readable with no replay — the property that makes an IIS log day independently
  parseable. Drift is the reader's job (diff two files), not the writer's.
- **Absence is signal.** A missing file means the machine was not collected that day. The
  run manifest is what distinguishes that from "collected, found nothing".
- **`_runs\` is underscore-prefixed** so a scanner enumerating machine folders skips it
  with one rule.
- **Aging** gzips files older than N days in place. The reader opens `.json.gz`
  transparently, exactly as `LogReader` wraps `.log.gz` in a `GZipStream`.
- **Machine folder name** is the `name` from `machines.json`, uppercased — the requested
  name, not the discovered one, so a machine that renames itself does not silently start a
  second folder. A mismatch between requested and discovered name is recorded in the
  envelope and surfaced as a finding.

---

## 5. Collection mechanism

### 5.1 One collector, executed locally, shipped in

`Get-MachineCensus.ps1` **never accepts a `-ComputerName`.** It always runs on the machine
it is describing and returns **exactly one `[string]`** — the already-serialised JSON.
`Invoke-Census.ps1` ships it with:

```powershell
Invoke-Command -Session $session -FilePath .\Get-MachineCensus.ps1
```

`-FilePath` transfers the script *text* into the session: nothing is written to the
target's disk and there is nothing to clean up.

**Why not remote CIM/DCOM.** It needs port 135 plus a dynamic high-port range (routinely
blocked) and cannot reach registry hives, `applicationHost.config`, the Windows Update
Agent COM API, or a local SQL instance. It covers a fraction of the field list and fails
opaquely.

**Why not an installed agent.** A daily census against a stable estate does not justify a
new thing to deploy, patch and defend to security.

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
  shared memory. Not a second hop. **Prove this empirically in Slice 1** — it is the single
  assumption most worth testing early, because the SQL collector depends on it.
- **Mapped network drives are a genuine second hop.** Free space on `\\fs01\share` cannot be
  read from a remoted session. Do not fight it: emit the mapping with
  `sizeStatus: "unavailable", reason: "double-hop"`.
- **CredSSP is never enabled.** It hands a delegatable credential to a machine you are
  auditing precisely because you do not know its state. Wrong trade for two optional
  fields, and a security conversation not worth having.

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
  stored secret at all. This is the current single-account case and stays the default.
- `kind: "clixml"` points at a DPAPI-protected `Export-CliXml` file, machine- **and**
  user-bound, decryptable only by the census account on the control box. Never in the repo,
  never on a command line.
- `trustedHosts` is per-bucket and **explicitly enumerated — never `*`.** Workgroup targets
  fall back from Kerberos to NTLM, which requires the entry on the control box.
- Every machine names exactly one bucket. No bucket is a config error, not a default.
- The envelope records `context.bucket`, so the reader can answer "did the DMZ bucket stop
  collecting on the 14th?" — a credential-expiry question, not a machine question.
- **Open:** buckets are modelled as credential scopes. If they should *also* be a reporting
  facet (environment, owning team, site), add a second free-string field on the machine
  record — LogExplorer's flat-facet model, not a hierarchy.

The Task Scheduler job runs as a dedicated account that is a member of **local
Administrators** on the targets. Domain Admin is not required and should be actively
refused — a census does not need it and asking for it poisons the engagement. The task runs
with *Run whether user is logged on or not* + *Run with highest privileges*, so its own
credential lives in the Windows credential store.

### 5.3 Reachability is a reported number, not an error

Laptops are off. That is the normal case, not a failure. Every run does a pre-flight probe
per machine, in order, recording each result:

**DNS resolve → TCP 5985/5986 → `Test-WSMan` → admin-rights check.**

These produce four different diagnoses — no DNS record, no route, WinRM not listening,
listening but access denied — with four different remediations. The run manifest reports
**expected / collected / partial / unreachable** per machine with the diagnosis.

A census that publishes findings before it publishes coverage is lying by omission. The
coverage number is the first thing the reader should show.

### 5.4 Collection profiles

Set once in `census.config.json`; recorded in the envelope so a reader knows why a field is
missing.

- **`Standard`** (default, what the nightly job runs) — everything safe and bounded.
- **`Deep`** (opt-in) — Windows Update online scan, filesystem scans for source folders and
  `.pdb`s, per-database SQL loops, full firewall rule enumeration, third-party CLI calls.
  Real value, real cost; not for a nightly job across the fleet.
- **`Forensic`** (explicit per-run consent) — `reg load` of unloaded `NTUSER.DAT`, Security
  event log mining, `secedit /export`.

**Banned at every profile, by construction:** `Win32_Product` enumeration (§7.5),
decrypting protected config sections, and **any write of any kind on a target machine.**

`Invoke-Census.ps1 -WhatIf` prints exactly which collectors and which commands would run at
the chosen profile. That printout is the artifact you hand a change board to get approval.

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

Seven properties, each load-bearing.

### 6.1 No top-level `data` blob

Payload always nests under its collector, so a partial run is *structurally identical* to a
complete one. Hard rule for every consumer including the phase-2 reader:
**read `collectors.X.status` before touching `collectors.X.data`.**

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

`not-present` ≠ `failed` ≠ `insufficient-rights`. The reader must never render an unknown
as an absence, and must never diff one into a `removed`. **"SQL Server was removed" because
a permission lapsed is the single failure that would destroy trust in a drift report.**

### 6.3 Per-collector `hash` — and the volatile-field rule

A SHA-256 over the payload, so the reader answers "did anything change on WEB01's installed
software since June?" with a filename scan and a field compare, instead of parsing and deep
-diffing a year of files. It is the census analogue of `LogDayCache`'s file signature.

**This only works if volatile fields are excluded from the hashed projection.** Free-space
bytes, PIDs, uptime, timestamps, durations, working-set sizes — all change every single
day. Include them and every hash differs on day two and the whole mechanism dies. Volatile
fields stay in `data`; they are simply not part of the hash input. Collections are sorted by
their diff key before hashing so ordering never registers as change.

### 6.4 Diff keys — named per collection, and several obvious choices are wrong

Every array element carries a key that survives reordering and renaming. Day-over-day
diffing by array index is worthless; this is what makes it work.

| Collection | Key | **Not** |
|---|---|---|
| Volumes | `UniqueId` | ~~drive letter~~ — reassigned |
| Installed software | (Publisher, DisplayName, Architecture, Scope, OwnerSid) | ~~uninstall key GUID~~ — changes on major upgrade |
| Services | `Name` | ~~DisplayName~~ |
| IIS sites | `Name` | ~~SiteId~~ — renumbers |
| IIS applications | (SiteName, Path) | |
| IIS app pools | `Name` | |
| Certificates | (Thumbprint, StoreName) | ~~Subject~~ — renewal keeps the subject |
| SQL databases | (InstanceName, DatabaseName) | ~~database_id~~ — reused after a drop |
| SQL database files | (InstanceName, DatabaseName, LogicalFileName) | ~~physical_name~~ |
| Scheduled tasks | (TaskPath, TaskName) | |
| Local group members | (GroupName, **SID**) | ~~account name~~ — renames |
| Network adapters | MacAddress | ~~index~~ |
| Hotfixes | HotFixID | |

### 6.5 Per-collector `version`

Bumped when a payload shape changes, so a reader spanning a year of files can handle an old
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
`secretsPresent` boolean and a SHA-256 of the normalized full string. The hash preserves
drift detection without preserving the secret. The raw string is discarded at the point of
collection and never reaches disk — because the census file *will* end up on a share.

**Encrypted config sections** are recorded as "encrypted, not decrypted". Never attempt
decryption; it would require impersonating the app identity and turns the census into an
exfiltration tool.

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
budget, `try/catch` recording exception type and message, and a guarantee that **no
collector can abort the run.** This is the nested-`try/catch` shape from
`Invoke-SqlMigrationController.ps1`: per-item inside per-controller.

`Precondition` is what produces an honest `not-present`. It must be a **cheap positive proof
of absence** — a registry key that is not there — never an inference from an empty result.

### 7.1 PowerShell floor

**Target Windows PowerShell 5.1** for both scripts. It is on every Server 2016+ and patched
2012 R2 box; `pwsh` is not. No `??`, no ternary, no `ForEach-Object -Parallel`, no
`ConvertFrom-Json -AsHashtable`. The dev box has both 5.1 and 7.6.3, so **5.1 compatibility
must be tested deliberately** (`powershell.exe -File …`), not assumed.

If Server 2012 R2 (PowerShell 4.0) is in scope, four collectors need fallbacks —
`Get-Volume`, `Get-NetTCPConnection`, `Get-NetAdapter`, and the `LocalAccounts` module are
absent or behave differently. See §6.6: record which path ran.

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

**MUST** = explicitly requested. **HIGH** = strongly recommended; most of the answers come
from these. **NICE** = cheap, add if free. Profile tag where not `Standard`.

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
  (3/6/7 desktop, 8/9/10/14 laptop, 23 rack). The clean laptop-vs-server-vs-desktop
  discriminator that does **not** depend on OS SKU — which matters precisely because this
  estate has Server SKUs being used as workstations.
- **CPU** *(HIGH)* — **socket count** (instance count of `Win32_Processor`),
  `NumberOfCores`, `NumberOfLogicalProcessors`, Name, MaxClockSpeed. Windows Server licenses
  per 16-core pack; SQL Server per core with a 4-core minimum. Sockets vs cores vs logical
  is the difference between a compliant estate and a six-figure audit finding, and nobody
  has the number.
- **Serial / model / SMBIOS UUID** — warranty lookup, hardware refresh, and an identity key
  that survives a rename.
- **Duplicate `machineGuid` or SMBIOS UUID across machines is a finding, not something to
  dedupe silently.** It means a VM was cloned from a template without sysprep, which breaks
  WSUS, MDM and licensing in ways nobody connects back.
- **RAM** *(MUST)* — see §8.10.
- *(NICE)* TPM, Secure Boot, firmware mode — Win11 readiness on laptops.

### 8.2 `os` — OS and lifecycle *(MUST + HIGH)*

`Win32_OperatingSystem` and `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion`.

- **`InstallationType`** (`Client` / `Server` / `Server Core`) is the authoritative
  server-vs-workstation signal — better than `ProductType`, and the field that lets the
  classifier say "Server SKU" while usage evidence says "workstation". **This is the exact
  case the estate has.** Collect both.
- **`CurrentBuild` + `UBR`** *(MUST)* — the true patch level, e.g. `20348.2582`. Exact,
  cheap, and unlike `Get-HotFix` **it cannot lie.** `Caption` alone never shows it.
- `DisplayVersion` / `ReleaseId`, `EditionID`, `ProductName`, `ProductType`,
  `OSArchitecture`, `InstallDate`, `LastBootUpTime`, SP level.
- **End-of-support status** *(HIGH)* — derived in the reader from (ProductName, EditionID,
  build) against `config/lifecycle.json`, shipped as **versioned data** so it refreshes
  without a code release. Record which table version scored the snapshot. This is the
  report that gets budget approved.
- **Pending reboot** *(HIGH)* — union of `…\Component Based Servicing\RebootPending`,
  `…\WindowsUpdate\Auto Update\RebootRequired`, `PendingFileRenameOperations`,
  `ServerManager\CurrentRebootAttempts`, and ActiveComputerName ≠ ComputerName. **Patched
  and protected are different states, and the gap is a reboot nobody scheduled.** A patch
  report without this says a machine is fine when it is not.
- **Activation** *(HIGH)* — `SoftwareLicensingProduct` where `PartialProductKey` is non-null:
  `LicenseStatus`, KMS vs MAK, grace period. **Never the product key.**
- **Uptime** — long uptime on a server plus a pending reboot is a compliance finding; on a
  laptop it means nothing.
- *(NICE)* time zone + NTP source (`w32tm /query /source`) — skew > 5 min kills Kerberos and
  gets misdiagnosed for days. Page file config, crash dump setting, locale.

### 8.3 `updates` — patches *(MUST)*

Three sources, because no single one is complete. **State the limits in the output, not just
the docs.**

1. **`Get-HotFix` / `Win32_QuickFixEngineering`** *(MUST — user asked)*. **The trap:** it
   returns CBS-registered hotfixes only; it shows the *latest cumulative update* rather than
   everything inside it, so a machine 14 months behind can look the same shape as a current
   one; `InstalledOn` derives from a culture-dependent registry string that is frequently
   blank or wrong; and it misses Defender definitions, Store apps and much .NET servicing.
   **Corroboration, never the answer.**
2. **Windows Update Agent COM** *(MUST)* —
   `(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher().QueryHistory(0, N)`.
   The real history: dates, titles, KB ids, ResultCode, and `ClientApplicationID` — which
   reveals *who* patches this box (WSUS / SCCM / manual). **Slow, and it hangs if the WU
   service is disabled.** Hard 30-second budget, then `timed-out`.
3. **`HKLM\…\WindowsUpdate\Auto Update\Results\{Detect,Download,Install}`** *(MUST)* — last
   successful timestamps. Cheap, never hangs.

Also:

- **Update source configuration** *(HIGH)* — `HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate[\AU]`:
  `WUServer`, `WUStatusServer`, `TargetGroup`, `UseWUServer`, `NoAutoUpdate`, `AUOptions`.
  **The root-cause field.** A machine 18 months behind usually is not broken — it is pointed
  at a WSUS that was decommissioned.
- **Management agents** *(HIGH)* — SCCM (`root\ccm` `SMS_Client`: version, site, MP),
  Intune/MDM (`dsregcmd /status`), third-party patchers. Distinguishes *unmanaged* from
  *managed and failing* — different remediations.
- **.NET versions** *(HIGH)* — Framework `Release` DWORD from
  `HKLM\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full`; .NET Core/5+ runtimes **and
  SDKs** from `dotnet --list-runtimes` / `--list-sdks` or `C:\Program Files\dotnet\shared`.
  Own EOL cadence, own CVEs — and **SDK presence on a server is a top-tier dev-box signal.**
- **Pending/missing updates** *(HIGH, `Deep` only)* —
  `IUpdateSearcher.Search("IsInstalled=0 and Type='Software'")`. The direct answer to "how
  exposed am I", but it is an online scan: minutes of CPU and network per machine, and on
  some AU configurations it can initiate downloads. Not for a nightly fleet run.
- **Fleet-relative build delta** *(HIGH, derived in the reader)* — a machine seven `UBR`
  revisions behind the newest build observed for its OS **in this census** is self-evident
  and needs no Microsoft catalog at all.

### 8.4 `apps` — installed software *(MUST)*

Registry uninstall hives, all three:
`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*`,
`HKLM\SOFTWARE\WOW6432Node\…\Uninstall\*`, and
`Registry::HKEY_USERS\<SID>\…\Uninstall\*` for every **loaded** hive.

Keep `DisplayName`, `DisplayVersion`, `Publisher`, `InstallDate`, `InstallLocation`,
`EstimatedSize`, `WindowsInstaller`, architecture, **and the source hive**. Route
`SystemComponent = 1` and `ParentKeyName`-bearing child patches to a separate bucket rather
than dropping them — the patch rows for Office and Visual Studio servicing are wanted.

> ### `Win32_Product` must never be called. Banned at every profile.
>
> Enumerating it triggers an MSI consistency check and **self-repair on every registered
> product** on the machine: minutes of runtime, `MsiInstaller` 1035/1004 reconfiguration
> events flooding the log, genuine state change including service restarts. It has
> reconfigured production applications in the field. It also only sees MSI installs, missing
> EXE/Squirrel/ClickOnce/portable apps — so it is both destructive *and* incomplete.
> **On a daily scheduled job across two dozen machines this would be actively harmful.**
> Put the ban in a code comment where someone would otherwise add it.

- **Per-user installs are a strong dev-box signal** — record the owning SID. A Server SKU
  with per-user installs of VS Code, Git and Slack is not a server. Loaded-hive enumeration
  is free and safe; `reg load` of unloaded profiles is `Forensic` only (§7, §11).
- **Unregistered app directories** *(HIGH)* — depth-2 listing of `C:\Program Files*`,
  `C:\Apps`, and non-system drive roots, matched against the uninstall list. Catches
  xcopy-deployed in-house apps, which is most in-house apps.
- **Binary provenance for in-house apps** *(HIGH — the differentiator)* — `FileVersion`,
  `ProductVersion`, `CompanyName`, `ProductName`, Authenticode signer + status, SHA-256,
  `LastWriteTime`, over **service binaries and one level of each IIS site's `bin\`**. In-house
  apps have no uninstall entry, so this is the only way to inventory them and the only way
  to detect version drift of your own software across a farm. Bounded — not a disk crawl.
- **Runtimes broken out** *(HIGH)* — VC++ redists, **Java (vendor + version — Oracle JDK
  8u211+ is commercially licensed)**, Python, Node.
- *(NICE)* `Get-AppxPackage -AllUsers` on client SKUs; package managers (choco, winget,
  scoop, global npm) — dev signal and an unmanaged software channel. `Deep`, they shell out
  and can hang.

### 8.5 `features` — Windows roles and features *(MUST)*

Branch on `InstallationType`; do not try/catch your way there.

- Server SKU → `Get-WindowsFeature` (Name, DisplayName, InstallState, FeatureType, Parent).
  **This cmdlet does not exist on Windows 10/11.**
- **Always also** → `Get-WindowsOptionalFeature -Online`.

They are **different vocabularies over overlapping sets** (`Web-Server` vs
`IIS-WebServerRole`) and neither is complete alone. Emit both into one collection with a
`source` field; **never pick one.** On client SKUs only the DISM view exists.

Derived flags that drive the classifier and half the findings: IIS present, **SMB1 enabled**,
Hyper-V, DNS/DHCP/ADDS, File Services, WSUS, **RDS role (a CAL licensing question)**,
Failover Clustering, MSMQ, .NET 3.5.

*(NICE)* `Get-WindowsCapability -Online` — RSAT, **OpenSSH server (an unmanaged remote-access
path)**.

### 8.6 `iis` — the deep dive *(MUST, and the biggest payload)*

**Parse `%windir%\System32\inetsrv\config\applicationHost.config` as XML directly.**
`WebAdministration` / `IISAdministration` are **not installed on the dev box** and their
availability varies by IIS version; the `IIS:` drive is slow, flaky under remoting and
quirky about inherited config. The file has everything, in one deterministic read. Fallback
`appcmd list <obj> /config /xml`. Precondition: `HKLM\SOFTWARE\Microsoft\InetStp` exists
(which also yields `VersionString`, `MajorVersion`, `PathWWWRoot`).

**Also capture `applicationHost.config`'s `LastWriteTime` + SHA-256.** That single hash
makes "did IIS config change overnight" a one-field comparison.

| Group | Fields | Pri |
|---|---|---|
| **Server** | IIS version, config path/hash/mtime, ASP.NET registered versions, **shared config enabled (a farm signal)**, Central Certificate Store config | MUST |
| **Sites** | Name, Id, State, `serverAutoStart`, root physical path, connection limits | MUST |
| **Bindings** | protocol, IP, port, **hostHeader**, **sslFlags** (1 = SNI, 2 = Central Cert Store), **certificateHash**, certificateStoreName | MUST |
| **App pools** | Name, State, **`managedRuntimeVersion`** (`""` = No Managed Code ⇒ .NET Core or static), **`managedPipelineMode`**, **`enable32BitAppOnWin64`**, autoStart, startMode, queueLength | MUST |
| **App pool `processModel`** | **`identityType`**, **`userName`** (never the password), `loadUserProfile`, **`idleTimeout`** + action, **`maxProcesses`** (> 1 = web garden, which breaks InProc session state), pingingEnabled, shutdownTimeLimit | MUST |
| **App pool `recycling` / `failure`** | periodicRestart time/requests/memory/privateMemory, scheduled times, `disallowOverlappingRotation`, `logEventOnRecycle`; rapidFailProtection interval + maxCrashes | MUST |
| **Applications & vdirs** | per app: site, path, applicationPool, **`enabledProtocols`** (`net.tcp`/`net.msmq` ⇒ WAS-hosted WCF), preloadEnabled, serviceAutoStart. Per vdir: path, **physicalPath**, **userName** (never the password), logonMethod | MUST |
| **Authentication, per application** | anonymous (enabled + **userName** — IUSR vs a named account); **windows** (enabled + **provider list and order**: Negotiate / NTLM / Negotiate:Kerberos, `useKernelMode`, **`useAppPoolCredentials`**, extendedProtection); basic (+ defaultLogonDomain, realm); digest; client-cert mapping (AD and one-to-one/many-to-one — **map names and cert subjects only, they contain stored credentials**); forms auth from web.config; per-app SSL flags (`Ssl`, `SslNegotiateCert`, `SslRequireCert`, `Ssl128`); authorization rules | MUST |
| **Modules / handlers / ISAPI** | globalModules, per-app managed modules, handler mappings, ISAPI filters, `isapiCgiRestriction`. **`<aspNetCore processPath= arguments= hostingModel=>` is the definitive .NET Core marker and names the entry-point binary**; its `<environmentVariables>` (`ASPNETCORE_ENVIRONMENT`) is a stage signal | HIGH |
| **URL Rewrite / ARR** | rewrite rules (name, match, conditions, action, target); `webFarms` (farm name, **member servers**, health-check URL, affinity), proxy enabled. **Literally a machine-readable dependency map** | HIGH |
| **Logging** | per site: enabled, directory, format, period, custom fields. **Plus derived: log directory total size, oldest file date, newest file date, last-24h byte volume** | HIGH |
| **Site content signals** | depth-limited: `.pdb` count, `*.sln`/`*.csproj` presence, `bin\Debug` paths, `App_Offline.htm`, total size, **newest binary write time ≈ last deployment date** | HIGH |

Two of these deserve their own note:

- **`useAppPoolCredentials` + Kerberos + a domain pool identity is the classic
  double-hop/SPN configuration.** Capturing it turns a recurring week-long auth
  investigation into a lookup.
- **Newest-log-file date and last-24h volume answer "is this site receiving any traffic at
  all" for essentially free.** Cheapest decommission-candidate detector in the design.

**`web.config` inventory** *(MUST, with care)* — presence, `LastWriteTime`, SHA-256
(**config drift across a load-balanced pair is detected by hash alone**), plus:

- **connectionStrings** — parsed per §6.7. **The app→database dependency edge, and the only
  place it exists.**
- **`machineKey`** — **presence and a hash only, never the values.** The hash across a farm
  answers "will forms auth and ViewState survive a load-balanced failover" — a real,
  recurring, expensive question.
- **`sessionState`** mode (InProc / StateServer / SQLServer + its connection string) — a
  cross-machine dependency and a scaling constraint.
- **`compilation debug="true"`** and **`customErrors mode="Off"`** — production
  anti-patterns, cheap to detect, embarrassing to miss.
- `targetFramework`, `httpRuntime` limits, trust level.
- `system.serviceModel` services, endpoints, and **client endpoints** (outbound
  dependencies); any `http(s)://` URL in appSettings.
- `appSettings` **keys only** by default; values are `Deep` and sensitive.

Also `netsh http show sslcert` and `netsh http show urlacl` *(HIGH)* — the HTTP.SYS tables
catch certificates bound at ports `applicationHost.config` does not describe, plus every
self-hosted WCF / HttpListener / Kestrel endpoint. Two answers from two cheap commands.

And `appcmd list wp` *(HIGH)* — running w3wp PIDs per pool. Proves a pool is genuinely in
use, not merely configured.

### 8.7 `certs` — the whole machine store *(HIGH)*

`Get-ChildItem Cert:\LocalMachine\{My, WebHosting, Root, CA, Remote Desktop}`: Subject,
**SAN / DnsNameList**, Issuer, **Thumbprint**, SerialNumber, NotBefore, **NotAfter**,
**HasPrivateKey**, **KeySize**, **SignatureAlgorithm**, EKU list, FriendlyName, Archived,
IsSelfSigned. **Never export a key.**

- **The binding join** *(HIGH — the differentiator)*. For each thumbprint, is it bound to
  IIS (§8.6), HTTP.SYS, **SQL Server**
  (`…\MSSQLServer\SuperSocketNetLib\Certificate` + `ForceEncryption`), **RDP**
  (`Win32_TSGeneralSetting.SSLCertificateSHA1Hash`), or a **WinRM HTTPS listener**?
  **An unbound expiring cert is noise; a bound one is a scheduled outage.** Only a census
  that collected all five surfaces can tell them apart.
- **SCHANNEL protocol/cipher policy** *(HIGH)* —
  `HKLM\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols`: TLS
  1.0/1.1/1.2/1.3 and SSL 2.0/3.0 × Client/Server × Enabled/DisabledByDefault, plus
  `Ciphers`, `KeyExchangeAlgorithms`, cipher suite order. **You cannot run a "disable TLS
  1.0" programme without the fleet matrix first** — and the matrix is exactly what finds the
  old app nobody remembered.
- **.NET TLS behaviour** *(HIGH)* — `SchUseStrongCrypto` and `SystemDefaultTlsVersions` in
  **both** `HKLM\SOFTWARE\Microsoft\.NETFramework\v4.0.30319` and the `WOW6432Node` hive.
  Two registry values, and the #1 root cause of "our .NET app can't call that TLS-1.2-only
  endpoint any more".
- *(NICE, `Deep`)* private-key ACLs — can hang on HSM / third-party CSPs; timeout and
  continue.

### 8.8 `sqlserver` *(MUST)*

**Discovery without connecting** — always, cheap, no SQL permission needed. Enumerate from
`HKLM\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL` — **not**
`Get-Service MSSQL*`, which misses instances and catches unrelated services. Per instance,
`MSSQLxx.NAME\Setup` gives Edition, Version, PatchLevel, SQLBinRoot, **SQLDataRoot**,
Collation; `MSSQLServer` gives **LoginMode** (1 = Windows, 2 = Mixed), **BackupDirectory**,
DefaultData/DefaultLog; `SuperSocketNetLib\Tcp\IPAll` gives **TcpPort / TcpDynamicPorts**,
ForceEncryption, Certificate. Services `MSSQL$X` / `SQLAgent$X` give **StartName** (the
service accounts) and StartMode. Also detect SSRS, SSAS, SSIS, **LocalDB**, and
SSMS-installed-but-no-engine.

**Connected** — raw `System.Data.SqlClient`, `Integrated Security=SSPI`,
`Application Name=census`, short timeouts, catalog views only. The `Execute-NativeSql` shape
from `Invoke-SqlMigrationController.ps1`. No `SqlServer` module — not installed here either.

| Group | Source | Pri |
|---|---|---|
| **Instance** | `SERVERPROPERTY`: ProductVersion, ProductLevel, **ProductUpdateLevel (CU)**, Edition, EngineEdition, IsClustered, **IsHadrEnabled**, Collation, IsIntegratedSecurityOnly | MUST |
| **Databases** | `sys.databases`: name, state_desc, **recovery_model_desc**, compatibility_level, collation, is_read_only, **is_auto_close_on**, **is_auto_shrink_on**, is_encrypted, `SUSER_SNAME(owner_sid)`, create_date, **log_reuse_wait_desc** | MUST |
| **Database files** | **`sys.master_files`** — instance-wide, one query, **no per-database context switch**: database_id, type_desc, name, **physical_name**, size, max_size, **growth**, **is_percent_growth** | MUST |
| **Backups** | `msdb.dbo.backupset` ⋈ `backupmediafamily`: MAX(backup_finish_date) by type D/I/L, size, is_copy_only, **physical_device_name**. **LEFT JOIN *from* `sys.databases`** — you are looking for *absence* | HIGH |
| **Logins & sysadmins** | `sys.server_principals` ⋈ `sys.server_role_members`; `sys.sql_logins` policy flags (**never `password_hash`**) | HIGH |
| **Linked servers** | `sys.servers WHERE is_linked = 1` + `sys.linked_logins` (local principal + remote name, **never the remote password**) | HIGH |
| **Agent jobs** | `msdb.dbo.sysjobs` (name, enabled, **owner**), `sysjobsteps` (subsystem, **command** — sensitive), schedules, latest outcome per job | HIGH |
| **Configuration** | `sys.configurations`: **max server memory**, MAXDOP, cost threshold, **xp_cmdshell**, clr enabled, Ole Automation, backup compression | HIGH |
| **tempdb** | `sys.master_files WHERE database_id = 2` + `sys.dm_os_sys_info.cpu_count` | HIGH |
| **HA/DR** | `sys.availability_groups`, replica states, listeners, `sys.database_mirroring`, `sys.dm_os_cluster_nodes`, log shipping, replication flags | HIGH |
| **Host facts** | `sys.dm_os_sys_info`: start time, physical_memory_kb, **cpu_count**, hyperthread_ratio, LPIM; `sys.dm_server_services` (**instant file initialization**, service account) | HIGH |
| **Space used per file** | `FILEPROPERTY(name,'SpaceUsed')` — needs a per-DB loop | HIGH, `Deep` |
| **Database users & roles** | per-DB `sys.database_principals` + role members, orphaned users | HIGH, `Deep` |
| **Trace flags, errorlog path** | `DBCC TRACESTATUS(-1) WITH NO_INFOMSGS` | NICE |

Notes that matter:

- **Permissions, stated deliberately: `VIEW SERVER STATE` + `VIEW ANY DEFINITION` +
  `db_datareader` on msdb covers everything above except the per-database loops. Do not ask
  for `sysadmin`.** That distinction is frequently the difference between getting approval
  to run the census and not.
- **`Edition` containing `Developer` in production is a straight license violation** — and
  separately a dev-box signal.
- **Express / LocalDB is a dev-box signal, not a database-server signal.** Without `Edition`
  a developer's laptop scores as a database server.
- FULL recovery + no log backup, joined to log file size, is the log-fills-the-disk
  timebomb, ranked by imminence.
- Percent-growth on a large file causes escalating stalls; a `max_size` ceiling causes a hard
  stop.
- If msdb history has been purged the backup-recency figure lies — capture the history
  cleanup job and the oldest row, and flag it.
- Wrap every database in `TRY`/`CATCH` and skip offline / restoring / read-only-secondary
  databases, so one inaccessible database cannot kill the collector.
- **SQL EOL** *(HIGH, derived)* — version → `config/lifecycle.json`.

### 8.9 `drives` *(MUST)*

Three **separately labelled** sets. Never merged — they are three different things.

1. **Local volumes** — `Get-Volume` primary: `UniqueId`, DriveLetter, FileSystemLabel,
   FileSystemType, DriveType, HealthStatus, **Size**, **SizeRemaining**, `Path`.
   `Win32_LogicalDisk` only as a PowerShell-4.0 fallback.
   **`Win32_LogicalDisk` cannot see volumes mounted as folders** — which is exactly how "the
   disk is full but no drive is full" happens on SQL servers. Add `Win32_MountPoint` /
   `Get-Partition` `AccessPaths` for mount points.
2. **Session mappings** — `Get-SmbMapping`.
   **Trap: `Win32_NetworkConnection` is useless remotely.** It returns mappings only for the
   calling user's session; under WinRM or a service context it returns *nothing at all*,
   silently. Anyone who ships it gets empty results and does not notice. Say this in the
   code comment. Sizes are `unavailable / double-hop`.
3. **Persistent mappings per user** — `Registry::HKEY_USERS\<SID>\Network\<letter>`
   (`RemotePath`, `UserName`, `ProviderName`) for every **loaded** hive. Per-SID, which is
   more useful than one flat list. Unloaded profiles need `reg load` — `Forensic` only.

Also:

- **Physical disks** *(HIGH)* — `Get-PhysicalDisk` / `Get-Disk`: Model, **MediaType
  (SSD/HDD)**, BusType, Size, HealthStatus, IsBoot. "The database is on spinning rust" is a
  finding.
- **SMB shares this machine serves** *(HIGH)* — `Get-SmbShare` + `Get-SmbShareAccess` +
  `Get-Acl` **on the share root only, never recursing**. On a server this matters far more
  than what it has mapped. `Everyone / Full Control` is a finding.
- **BitLocker** *(HIGH for laptops)* — `Get-BitLockerVolume`: ProtectionStatus,
  EncryptionMethod, key protector **types**. **Never recovery keys.**
- *(NICE)* `SUBST` drives from `HKLM\SYSTEM\CCS\Control\Session Manager\DOS Devices`;
  dedup; Storage Spaces pools.

> **The `UncDependency` idea — worth adopting.** For a *server*, per-user mapped drives are
> the wrong deliverable. A server's real network-path dependencies live in IIS vdir physical
> paths, service binary paths, scheduled-task working directories, SQL backup directories and
> `sys.master_files` paths, share definitions, and hosts-file entries. Have **every collector
> that emits a path** contribute to one `uncDependencies` collection keyed on
> `\\server\share` with a `sourceKind` field. That is the artifact that answers *"what does
> this machine reach across the network for"*. Mapped drives become one `sourceKind` among
> eight, and stay primary only for laptops.
>
> *(Cheap fleet-level bonus, `Deep`:* Group Policy drive maps live in
> `\\<domain>\SYSVOL\<domain>\Policies\{GUID}\User\Preferences\Drives\Drives.xml`. One read
> yields the **intended** mapping for the whole domain, to diff against observation.)

### 8.10 `memory` *(MUST)*

`Win32_ComputerSystem.TotalPhysicalMemory`, the sum of `Win32_PhysicalMemory.Capacity`, and
`Win32_OperatingSystem.TotalVisibleMemorySize`. **Record all three.** They legitimately
disagree — hardware reservation, and VMs report synthetic or absent DIMMs — and the
discrepancy is itself informative. **Do not pick a winner in the collector.**

*(HIGH)* DIMM detail: Capacity, Speed, DeviceLocator, plus `Win32_PhysicalMemoryArray`
MaxCapacity and **slots used vs total**. Answers "can we add RAM without buying a server" —
the cheapest remediation in any fleet. *(NICE)* page file size and location; free physical
memory as a volatile field (excluded from the hash).

### 8.11 `services` *(HIGH — the one most likely to surprise)*

**`Get-CimInstance Win32_Service`, not `Get-Service`** — the latter exposes neither
`StartName` nor `PathName`.

Name, DisplayName, **PathName** (binary + args), StartMode, State, **StartName (the logon
account)**, ServiceType, DelayedAutoStart, Description, ProcessId, ExitCode.

**`StartName` is the census's most valuable single column.** It is the `ServiceAccount` node
in app-graph, the blast radius of a password rotation, and the privilege-escalation surface,
all at once.

This is also where the non-IIS applications are. A "web server" that also runs three custom
Windows services hosting .NET workers is not described by IIS data alone.

Derived findings, free from data already collected:

- **Auto + Stopped** — something broke and nobody noticed.
- **Unquoted service path containing spaces** — a textbook privilege-escalation finding.
- **Binary under a user profile** — you found a dev box, or worse.
- Binary outside `%SystemRoot%` and vendor `Program Files` → an in-house app; enrich with
  §8.4 binary provenance.

*(HIGH)* **Running processes** — `Win32_Process`: Name, ExecutablePath, **CommandLine**,
ParentProcessId, StartTime. **CommandLine is how you find Kestrel (`dotnet x.dll`), node,
and `java -jar`** — self-hosted services that have no installer. Sensitive: command lines
occasionally carry credentials.

*(NICE)* `sc.exe qfailure` recovery actions — a critical service set to "take no action" on
failure is a silent outage. COM+ applications and their identities, for legacy estates.

### 8.12 `tasks` — scheduled tasks *(HIGH)*

`Get-ScheduledTask` + `Get-ScheduledTaskInfo`: TaskName, TaskPath, State, Author,
**Principal (UserId, LogonType, RunLevel)**, Actions (Execute, Arguments, WorkingDirectory),
Triggers, LastRunTime, **LastTaskResult**, NextRunTime. `schtasks /query /fo csv /v` as the
2008 R2 fallback.

Batch jobs hide here. So do forgotten scripts still running as a departed employee's
account. **`LastTaskResult ≠ 0` finds jobs that have been silently failing for months.**

Exclude `\Microsoft\Windows\*` by default but **report the count**. Action arguments are
sensitive.

### 8.13 `network` *(HIGH)*

`Get-NetIPConfiguration` / `Get-NetAdapter` / `Win32_NetworkAdapterConfiguration`: adapters
(Name, InterfaceDescription, MacAddress, LinkSpeed, Status), IPv4/IPv6 addresses,
**PrefixOrigin (Dhcp vs Manual)**, gateway, **DNS servers**, DNS suffix, DHCP server + lease.

- **Listening TCP/UDP endpoints joined to the owning process path** *(HIGH)* —
  `Get-NetTCPConnection -State Listen` ⋈ `Win32_Process` on `OwningProcess`; `netstat -ano`
  fallback. **The best single "what does this machine actually serve" signal in the census.**
  It finds the hosted app with no installer, no service description and no documentation —
  and it is *empirical*, unlike everything derived from what is installed. A dev VM with
  nothing listening but RDP is not a server, whatever is on it.
- **hosts file** *(HIGH)* — non-comment entries. Hand-wired dependencies in plain sight; the
  answer to "why is prod still pointing at the decommissioned server". Sensitive.
- **Firewall profiles** *(HIGH)* — `Get-NetFirewallProfile`: enabled state, default inbound
  action, logging. Cheap, and "firewall off on the domain profile" is a finding.
- **SMB config** *(HIGH)* — `Get-SmbServerConfiguration` / `Get-SmbClientConfiguration`:
  **SMB1 enabled**, signing required, encryption.
- *(HIGH, `Deep`)* full firewall rules with port + address filter joins — thousands of
  objects and slow in PowerShell; filter to non-built-in by default.
- *(NICE)* NIC teaming; `netsh winhttp show proxy`; WinRM listener config (meta: it is how
  the census runs, and it is an unmanaged remote-access path).

### 8.14 `security` *(HIGH)*

- **Local Administrators membership** *(HIGH)* — the most consistently surprising thing a
  census finds, and the #1 lateral-movement fact in an estate.
  **`Get-LocalGroupMember` throws on orphaned / unresolvable SIDs and kills the whole
  collector** — fall back to ADSI `WinNT://` or `net localgroup`. Also collect Remote
  Desktop Users, Backup Operators. Sensitive.
- **Local accounts** *(HIGH)* — `Get-LocalUser` / `Win32_UserAccount WHERE LocalAccount=True`:
  Enabled, SID (RID 500 detection — was the built-in Administrator renamed?), LastLogon,
  PasswordLastSet, PasswordNeverExpires.
- **LAPS** *(HIGH)* — legacy AdmPwd CSE installed, Windows LAPS policy, last rotation.
  Answers **"is the local admin password the same on all 24 machines"** — the single largest
  risk multiplier in most estates. **Never the password.**
- **AV / EDR** *(HIGH)* — **`root\SecurityCenter2\AntiVirusProduct` exists on client SKUs
  only. It is absent on Server, and code that relies on it reports "no AV" for every server
  in the fleet.** On Server use `Get-MpComputerStatus` / `Get-MpPreference`, plus service-name
  detection for CrowdStrike (`CSFalconService`), SentinelOne, Sophos, Symantec, Trend, Carbon
  Black. **Defender exclusions** are both legitimate SQL/IIS practice and a favourite
  persistence trick — inventory them either way. Sensitive.
- **RDP** *(HIGH)* — `fDenyTSConnections`, **`UserAuthenticationRequired` (NLA)**,
  SecurityLayer, port, bound cert thumbprint. RDP without NLA is directly exploitable and
  trivially fixed.
- **UAC / credential hygiene** *(HIGH)* —
  `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System`: `EnableLUA`,
  `ConsentPromptBehaviorAdmin`, **`LocalAccountTokenFilterPolicy`** (a deliberate
  lateral-movement enabler, usually set "temporarily" years ago), `FilterAdministratorToken`.
  Plus WDigest `UseLogonCredential`, `LmCompatibilityLevel`, LSA `RunAsPPL`, Credential Guard.
- *(NICE)* PowerShell v2 engine enabled (bypasses modern logging), `Get-ExecutionPolicy -List`,
  script-block logging / transcription. `auditpol` at `Deep`; `secedit /export` at `Forensic`
  (it writes a temp file).

### 8.15 `usage` — the dev-box tell *(HIGH — this is what answers the categorization question)*

Everything above feeds classification; these signals exist specifically to separate a real
server from a Server-SKU box a developer works on.

| Signal | Acquisition | Strength |
|---|---|---|
| **.NET SDK or Visual Studio / Build Tools installed** | `dotnet --list-sdks` (**SDK ≠ runtime — this is the distinction that matters**), `vswhere.exe -all -format json` for products/versions/workloads, or the software list | **Strongest single signal.** A server needs the *runtime*; only a developer needs the *SDK*. |
| **User profiles present and recently used** | `Win32_UserProfile`: LocalPath, SID, **LastUseTime**, Special, Loaded, RoamingConfigured | **The cheap replacement for event-log mining.** Two or more non-special profiles used in the last 30 days on a server = humans work here. Instant, no Security log, no extra privilege. |
| Dev tooling | software list: VS Code, Rider/ReSharper, Git for Windows, Tortoise*, Node, Python, Docker Desktop, Postman, Fiddler, LINQPad, Azure Data Studio, NuGet CLI | Medium each. **Weight SSMS low deliberately** — SSMS on a database server is an admin tool, not development. |
| SQL **Developer/Express**, LocalDB, database files under a user profile path | §8.8 + `physical_name` prefix match | Medium-strong; separately a licensing finding |
| **`.pdb`s / `debug="true"` / `*.sln` in a served app root** | §8.6 | Strong, cheap. The "xcopied from a workstation" tell |
| Office / Outlook / Teams / browsers on a Server OS | software list | Medium. Humans read email here |
| Source-control working folders | depth ≤ 4, time-budgeted scan of `C:\Users\*`, `C:\src`, `C:\dev`, `C:\git`, non-system drive roots for `.git`, `.vs`, `*.sln`, `node_modules`. **Excluded: `%WinDir%`, `Program Files`, SQL data dirs, any network path.** Counts and top paths only, never contents | Strong. `Deep`. Paths are sensitive |
| Interactive logon history | Security 4624 type 2/10, `Get-WinEvent -FilterHashtable` with **`-MaxEvents` and a bounded window** | Decisive but expensive. `Deep` opt-in, skip DCs |

**Deliberate asymmetry:** SSMS or Git alone must **not** assert dev usage — they are admin
tools on a real DB server. Require SDK-or-source-folders to reach high confidence; tooling
alone caps the assertion. This suppresses the most likely false positive.

### 8.16 `hosted` — non-IIS applications *(HIGH)*

| Target | Acquisition |
|---|---|
| **Custom Windows services** | §8.11 ⋈ §8.4 binary provenance — how most in-house .NET services are deployed, and they appear in no other inventory |
| **Kestrel / self-hosted .NET** | `Win32_Process` CommandLine matching `dotnet *.dll`, or an `.exe` with an adjacent `*.runtimeconfig.json`; `ASPNETCORE_URLS` / `ASPNETCORE_ENVIRONMENT`; `netsh http show urlacl`; listening ports with non-IIS owners |
| **Node** | `node.exe` processes + CommandLine, `iisnode` handler in IIS config, `package.json` in app dirs |
| **Java / Tomcat / JBoss** | `java.exe`/`javaw.exe` processes, `JAVA_HOME`, `Tomcat*` services, catalina paths, vendor + version — hosting *and* Oracle licensing |
| **Apache / nginx on Windows** | `httpd.exe` / `nginx.exe` services and processes — frequently the reverse proxy nobody documented |
| **Queues & caches** | MSMQ (feature + private queues), RabbitMQ, Redis, ActiveMQ, Kafka. **Asynchronous dependencies are invisible to every network-based discovery tool** |
| **WCF via WAS** | IIS `enabledProtocols` containing `net.tcp` / `net.msmq` / `net.pipe`; `system.serviceModel` |
| **Platform products** | SSRS (`rsreportserver.config` URLs), SSIS catalog, BizTalk, SharePoint, Exchange, ADFS — each drags a whole dependency subgraph |
| **Machine environment variables** | `Win32_Environment` / `HKLM\SYSTEM\CCS\Control\Session Manager\Environment`. **Keys always; values `Deep` + sensitive** — they hold endpoints, `JAVA_HOME`, `ASPNETCORE_ENVIRONMENT`, occasionally credentials |

### 8.17 Explicitly out of scope, and why

- **`Win32_Product`** — destructive (§8.4). Banned.
- **Decrypting protected config sections** — turns an inventory tool into an exfiltration
  tool.
- **Any write on a target machine** — no temp files, no registry writes, no service starts.
  Two exceptions are `Forensic`-only and must be argued individually: `reg load`, and
  `secedit /export`.
- **Performance sampling.** Census is structural; utilization belongs to a monitoring
  system. *(Do keep one free point-in-time snapshot — free RAM, uptime, top-5 processes by
  working set — because a 4 GB box running SQL and IIS is a finding needing no sampling.)*
- Full-disk enumeration, whole-registry export, unbounded event-log dumps.
- Certificate private keys, app-pool passwords, raw connection strings, LAPS/BitLocker
  secrets, product keys — never, at any profile.

---

## 9. Classification

Usage is *inferred*, so it must be **arguable**. Every role assignment carries a score, a
confidence, and cited evidence pointing back into the envelope.

### 9.1 Where it runs

**The collector observes; the reader classifies.** Rules will change far more often than
facts. Keeping the daily JSON purely factual means a rule change reclassifies a year of
history for free instead of only affecting tomorrow. `config/roles.json` ships with phase 1
as a documented artifact — so the field list can be checked against it — but **nothing in
the daily file is a verdict.**

### 9.2 Three axes, never collapsed

- **Provisioned class** (deterministic, no inference) — `Server` / `ServerCore` /
  `DomainController` / `Client-Desktop` / `Client-Laptop`, × `Physical` / `Virtual`. From
  `InstallationType`, `ProductType`, `EditionID`, chassis type, battery, hypervisor
  detection.
- **Observed workload roles** (multi-label, scored) — `WebServer`, `DatabaseServer`,
  `AppServer`, `FileServer`, `DomainController`, `Hypervisor`, `InfrastructureUtility`,
  `DevWorkstationUsage`, `EndUserWorkstation`.
- **Divergence verdicts** (derived from the first two) — `ServerOsUsedAsDevBox`,
  `IdleServer`, `MultiRoleServer`, `WorkstationRunningServerWorkload`, `UnmanagedMachine`.

**The estate's "Server OS used by developers" category is literally the divergence between
axis 1 and axis 2. It only exists if both are modelled.** A machine gets a role *set*, not a
label; `primaryRole` exists as a display convenience and is never a report predicate.

### 9.3 Scoring

`score = Σ weights of matched signals`. Bands: Confirmed ≥ 8, Likely 5–7, Possible 3–4.

- **Negative weights are mandatory, not decoration.** "IIS installed but the only site is a
  stopped Default Web Site with no log growth in 90 days" is the classic false positive that
  makes a census look naive.
- **Confidence is capped by evidence completeness, not just score.** If `iis` returned
  `insufficient-rights`, `WebServer` cannot reach high confidence — emit
  `confidence: "unknown"` with `blockedBy: ["iis:insufficient-rights"]`, never a low number.
  A classifier that cannot see the evidence must say so.

Sketches:

```
WebServer          +5 IIS installed AND ≥1 started site beyond Default Web Site with a non-loopback binding
                   +3 IIS logs written in the last 30 days
                   +3 non-IIS process listening on 80/443
                   +2 ARR farm or rewrite proxy rules
                   −3 only Default Web Site, stopped, no log growth in 90 days

DatabaseServer     +5 engine service Running AND Edition ∉ {Express, LocalDB}
                   +4 ≥1 user database (database_id > 4) > 1 GB or backed up in the last 30 days
                   +2 SQL Agent running with ≥1 enabled job
                   −4 only LocalDB/Express AND every user DB file under a user profile path

AppServer          +4 non-Microsoft service, Auto, Running, binary outside vendor Program Files,
                      stamped with an in-house CompanyName
                   +3 that process holds a listening port
                   +2 Tomcat / node / Kestrel / nginx / Redis / RabbitMQ signal

DevWorkstationUsage +5 .NET SDK or Visual Studio / Build Tools installed
                   +4 ≥2 non-special user profiles with LastUseTime < 30 days
                   +3 source working folders outside deployment paths
                   +3 two or more of {VS Code, Rider, Git client, Postman, LINQPad, Docker Desktop}
                   +2 SQL Developer/Express or LocalDB
                   +2 .pdb or debug="true" in a served app root
                   −3 zero non-special profiles used in 90 days
```

### 9.4 Divergence verdicts, spelled out

```
ServerOsUsedAsDevBox :=
      provisionedClass ∈ {Server, ServerCore}
  AND DevWorkstationUsage ≥ Likely
  AND ( no workload role at Confirmed
        OR every Confirmed workload role is itself dev-staged
           — binding host headers / DB names / ASPNETCORE_ENVIRONMENT match dev|test|uat|local )

IdleServer :=                                  -- decommission candidate; highest ROI in the census
      provisionedClass ∈ {Server, ServerCore}
  AND no IIS log growth in 90d (or no IIS)
  AND no SQL user database with a backup or activity in 90d (or no SQL)
  AND no non-special user profile used in 90d
  AND no Running non-Microsoft service holding a listening port

MultiRoleServer :=  count(workload roles ≥ Likely, excluding Dev*) ≥ 2
                    -- normal; emit all roles, never force a winner.
                    -- The consequence is the point: the patching window must satisfy
                    -- the union of every role's constraints.

WorkstationRunningServerWorkload :=
      provisionedClass ∈ {Client-*} AND (WebServer | DatabaseServer | AppServer) ≥ Likely

UnmanagedMachine :=
      no SCCM/Intune agent AND (no WSUS policy OR WUServer does not resolve)
  AND days since last successful update install > 90
```

**Stage inference** (dev/test/uat/prod) is a separate scored classifier over hostname
tokens, IIS binding host headers, `ASPNETCORE_ENVIRONMENT`, connection-string
`Data Source`/`Initial Catalog` tokens, and AD OU name. Always emitted with confidence,
never silently authoritative.

### 9.5 Rules as data

`config/roles.json`: `{ signalId, jsonPath into the envelope, predicate, weight, role }`.
Stamped with `ruleSetVersion` so historical classifications stay explicable after the rules
move. Every asserted role persists its matched signals **with the observed values**, so
"why is this a web server?" — and equally "why is this *not* a database server?" — is
answerable. This is app-graph's `AssertedBy` / `Basis` provenance discipline carried into
census.

Keep the matcher primitives deliberately few: `feature`, `appNameMatches`, `serviceState`,
`registryKeyExists`, `count`, `osInstallationType`, `sqlEdition`, `collectorStatus`. Resist
a general expression language; when a rule needs something the primitives cannot express,
add a primitive. That is the data/code seam and it should be crossed rarely.

---

## 10. Reports phase 2 can produce

Listed here because they are what justifies the field list.

1. **Coverage** — expected / collected / partial / unreachable, with per-machine diagnosis.
   **Published beside every other report.** A census at 78 % coverage with no coverage
   statement lies quietly.
2. **Certificate expiry calendar** — buckets (expired / 30 / 60 / 90 / 180 d) × bound-or-not,
   showing what each bound cert secures. **Grouped by thumbprint across machines**, because
   the same cert on six machines is one renewal and six deployments — and the sixth gets
   missed.
3. **End-of-support inventory** — Windows, SQL Server, .NET, Java, with the count of
   applications and databases riding on each. The budget document.
4. **Patch-age ranking** — days since last successful install, **fleet-relative `UBR` delta**
   (no external catalog needed), pending-reboot flag, and the WSUS-target breakdown that
   explains *why* the laggards lag.
5. **Service-account blast radius** — for each account, every place it is used fleet-wide:
   services, app-pool identities, task principals, IIS anonymous/vdir identities, SQL service
   accounts, SQL logins, Agent job owners. **The flagship report.** The literal answer to
   "what breaks if we rotate this password", which is unanswerable today.
6. **Version drift** — same product at different versions across machines, ranked by spread;
   in-house apps matched on (CompanyName, ProductName) from binary metadata. Includes
   **web.config and `machineKey` hash drift across a load-balanced pair** — the cause of "it
   only fails on some requests".
7. **Idle servers / decommission candidates** — §9.4.
8. **Orphaned and broken IIS objects** — app pools with zero applications, stopped sites,
   sites with no log traffic in 90 days, pool identities that no longer resolve in AD,
   bindings referencing an absent or expired cert, vdirs whose physical path does not exist.
9. **Capacity** — volumes under 10 % or 10 GB free, **ranked by time-to-full once two
   censuses exist** (the diff makes this a trend, not a snapshot); SQL files near `max_size`;
   IIS log directories over threshold; SQL `max server memory` vs physical RAM.
10. **Backup gaps** — databases with no full backup in N days, FULL-recovery with no log
    backup ranked by log size, backups on the same volume as the data file, **databases with
    no backup record at all**.
11. **Cross-machine dependency map** — UNC paths, linked servers, connection strings, ARR
    farms, hosts entries, WCF client endpoints, appSettings URLs. Exposes dependencies on
    machines **not in the census** — the coverage gap that matters most.
12. **Security posture matrix** — one row per machine × control: local admin membership (and
    **who is an admin everywhere**), LAPS, SMB1, TLS 1.0/1.1, RDP NLA,
    `LocalAccountTokenFilterPolicy`, unquoted service paths, AV exclusions, `xp_cmdshell`.
13. **Licensing exposure** — Windows Server cores by edition, SQL cores × edition, **SQL
    Developer Edition in production**, RDS role without CAL clarity, Visual Studio installs,
    Oracle Java.
14. **Snowflake index** — per machine, the count of attributes differing from the modal value
    among its role peers (features, services, TLS settings, .NET version, DNS servers, pool
    identity types). Ranks machines by *how special they are*. Special is a synonym for
    fragile, and it points remediation at the right boxes.
15. **Collector health** — a collector that failed on every machine is **one** systemic
    access problem, not 24 machine problems.

---

## 11. Build order

Each slice is verified before the next starts.

**Slice 0 — pre-flight only.** `Invoke-Census.ps1 -PreFlightOnly` against the real list.
*Verify:* a transport report saying, per machine, resolvable / port open / WinRM answering /
admin rights. **Delivers value before a single fact is collected and tells you how much of
the estate is reachable at all. Do not fold this into a later slice.**

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

**Slice 3 — remaining collectors.** In this order — cheapest and least likely to hang first,
so the envelope is useful early and risky ones join a working base:
`features` → `services` → `apps` → `network` → `tasks` → `security` → `iis` (+ `certs`) →
`sqlserver` → `hosted` → `usage` → **`updates` last** (it is the one that hangs).
*Verify:* **every collector tested on both a box that has the subject and a box that lacks
it.** The `not-present` case is the one people skip and the one that matters. The dev box
has neither IIS nor SQL Server, so it is the natural fixture for both.

**Slice 4 — scheduled job.** Register the daily task; let it run unattended overnight.
*Verify:* next morning there is one new file per reachable machine, a run manifest, and the
previous day's files are untouched.

**Slice 5 — aging + fixtures.** Gzip files older than N days. `New-SampleCensus.ps1`
generates a synthetic multi-machine, multi-day tree — a web farm, a SQL box, a laptop, a dev
VM on Server OS, one machine with a gap, one with a collector permanently in
`insufficient-rights` — so phase 2 can be built without touching production. Mirrors
`generate-sample-logs.ps1`.

---

## 12. Open items

- **Machine list provenance** — hand-maintained `machines.json`, or generated from AD
  `Get-ADComputer` / a CMDB? Determines whether "never seen" is meaningful, and whether the
  coverage report has a real denominator. Note the `ActiveDirectory` module is not on the dev
  box.
- **Bucket taxonomy** — buckets are credential scopes today. If they should also be a
  reporting facet (environment, owning team, site), add a second free-string field on the
  machine record — LogExplorer's flat-facet model, not a hierarchy. Decide before the reader
  is built.
- **Census root location** — UNC share vs local to the control box. Recommendation: a config
  value from day one, ACL'd to the census account and admins, so moving it is a settings
  change. **This tree is considerably more sensitive than an IIS log tree** — it is a
  complete map of every weak point in the estate. Treat the root as tier-0: restricted ACL,
  no email exports, no ad-hoc copies.
- **Retention** — how long before daily files are gzipped, and before they are deleted.
  Position: gzip at 30 days, keep indefinitely (the volume is trivial at this scale), but
  make it a decision rather than an accident.
- **PowerShell floor** — is Server 2012 R2 (PowerShell 4.0) in scope? It costs four fallback
  code paths, and the fallbacks must not read as change in the diff (§6.6).
- **Script signing** — if the estate enforces `AllSigned`, `-FilePath` transfer and the
  portable collector need a code-signing certificate.
- **SQL permissions** — will the instances grant `VIEW SERVER STATE` + `VIEW ANY DEFINITION`
  + msdb read to the census account? Determines how often `sqlserver` degrades to
  `insufficient-rights`. **Do not ask for `sysadmin`.**
- **Per-user hive depth** — persistent mapped drives and per-user installs for *logged-off*
  users need `reg load` of `NTUSER.DAT`. It takes a hive lock; a failed unload blocks profile
  unload and breaks roaming-profile sync. Position: **loaded hives only**, gap declared in
  the report. `Forensic` only if ever enabled, with a guaranteed `finally` unload.
- **Connection strings** — the position above is parse-and-drop. If any capture at all is
  unacceptable, say so and the `iis` collector drops `web.config` parsing entirely — losing
  the app→database dependency map, which is the single richest thing the census produces.
- **`appgraph` export** — census output is close to a superset of the ratified ontology
  (`Server`, `AppInstance`, `AppPool`, `ServiceAccount`, `Certificate`, `DatabaseInstance`,
  `Database`, `DbUser`). An exporter modelled on `apptrak-import.md` — insert-only,
  idempotent, `AssertedBy = 'census-import'`, `Basis` citing run id + collector + json path —
  is a natural later slice. **Position: keep census standalone, align field names where it
  is free, do not import the ontology and do not couple the projects now.** Note that
  app-graph's PD-3 ruled against automated discovery; census is asset observation rather than
  dependency inference, but a census→appgraph write would need its own ratified decision
  and should be operator-initiated with a dry-run diff, never automatic per run.

---

## 13. Decisions to record in `.docs/spec/decisions.md`

| | Decision |
|---|---|
| **CD-1** | One collector, executed locally, shipped in by `-FilePath`; portable build as fallback. No agent, no remote CIM. |
| **CD-2** | Collector status vocabulary, and the invariant that unknown is never absent. |
| **CD-3** | Full snapshot per machine per day; IIS-log-style tree; absence is signal; the reader computes drift. |
| **CD-4** | Per-collector hash with a volatile-field exclusion list; named diff keys per collection. |
| **CD-5** | The collector observes, the reader classifies. Rules as data, versioned. |
| **CD-6** | No CredSSP; no secret capture at any profile; connection strings parse-and-drop. |
| **CD-7** | `Win32_Product` banned outright; no writes on target machines. |
| **CD-8** | Windows PowerShell 5.1 floor; fallback paths recorded in the payload. |
| **CD-9** | Credential buckets from day one; `task-identity` as the default kind. |
| **CD-10** | Census standalone; `appgraph` export deferred and, if ever built, operator-initiated. |
