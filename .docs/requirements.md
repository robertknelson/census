# Census Collector — Requirements

> Status: draft, for discussion. Supersedes nothing yet — `.docs/plan.md` (Opus's original,
> broader design) and `.docs/features/census-collector.md` (first trim) stay as reference
> material but this document is the one to ratify against. Once settled, implementation
> detail (cmdlets, registry paths, PowerShell version quirks) gets worked out separately —
> this file stays at the requirements level.

## 1. Purpose

Catalog what's installed across ~2 dozen Windows machines — OS, patches, .NET/SDK, and
installed software — and determine, per machine, whether it's a **web server**, **database
server**, **dev server** (a Server-OS box actually used for development), or **dev laptop**
(Windows 11, used for development).

Primary use: software license compliance and unapproved-software detection. Everything below
is scoped to serve that.

## 2. Operating model

- One script (plus config), run from a single control machine, once daily via Task Scheduler.
- Reaches each target over **PowerShell Remoting (WinRM)** — `Invoke-Command` executes
  remotely but nothing is installed or left behind on the target; the script and its config
  live in exactly one place.
- Runs under **one dedicated account**, which must have local admin rights on every target.
  No per-machine or per-group credentials.
- A target being unreachable (powered off, network down, WinRM not listening) is a normal,
  expected outcome, not a script failure — the run continues past it and records it.
- Sequential or lightly-parallel; reliability over throughput at this scale.

## 3. Data to collect, per machine

### 3.1 Identity & hardware

- Computer name, domain, FQDN, machine GUID / SMBIOS UUID.
- Physical vs. virtual, and which hypervisor (from BIOS/model string).
- CPU socket and core counts (Windows Server / SQL Server licensing is core-based).
- Total RAM lives in its own top-level `memory` section (§3.2), not nested here — same
  reasoning as drives: easy to find without digging through an unrelated category.

### 3.2 Memory

- Total physical RAM, in bytes and GB.

### 3.3 Operating system

- Product name, edition, installation type (Client / Server / Server Core), architecture.
- Exact patch level: `CurrentBuild` + `UBR`.
- Install date, last boot time.
- Pending-reboot status — patched and actually protected are different states, and a server
  that's been due for a reboot for weeks is exactly the kind of thing this census should
  surface.

### 3.4 Updates / patches

- Current patch level (§3.3) plus last successful Windows Update install/detect timestamps
  from the registry. Cheap, never hangs.
- No live Windows Update Agent history query for now — current state is enough to answer "is
  this patched" and "when did it last check in."

### 3.5 .NET

- .NET Framework version (registry release value).
- .NET Core / .NET 5+ **runtimes** installed.
- .NET **SDKs** installed (`dotnet --list-sdks`) — the strongest single dev-machine signal:
  a server needs the runtime, only a developer needs the SDK.

### 3.6 Drives

- Local, lettered volumes only: drive letter, label, file system, drive type, health status,
  size, free space, used space (computed), percent free.
- Deliberately out of scope: volumes mounted as a folder rather than a drive letter (common
  on dedicated SQL data volumes), session/persistent network drive mappings. Not asked for;
  flagging rather than silently including a bigger drives model than was requested.

### 3.7 Installed software

- Uninstall-registry scan: `HKLM` (native + WOW6432Node) **plus every currently-loaded
  per-user hive**.
- Per entry: name, version, publisher, install date, install location, architecture, and
  which hive it came from (machine-wide, or per-user with the owning SID).
- This is what the license and unapproved-software review actually runs against — per-user
  installs (VS Code, Git, Slack, etc.) matter as much as machine-wide ones here.

### 3.8 IIS — web-server signal

- Whether IIS is installed at all.
- Site list: name, state, bindings (protocol / IP / port / host header).
- Not collected: app-pool internals, web.config parsing, connection strings.

### 3.9 Certificates

- **Certificate detail for every certificate bound to an IIS binding (including classic
  non-SNI bindings), or to RDP** — thumbprint, subject, SAN, issuer, NotBefore/NotAfter, key
  size, days until expiry, and what it's bound to. This is critical: it's how certificate
  expiry gets tracked without a separate tool.
- Two IIS binding sources, both needed: `applicationHost.config`'s `certificateHash` (SNI
  bindings only) **and** the HTTP.SYS SSL binding table via `netsh http show sslcert`
  (classic IP-based bindings — still common, and invisible to the XML alone).
- RDP's bound certificate comes from `Win32_TSGeneralSetting.SSLCertificateSHA1Hash`. If that
  WMI namespace doesn't exist (e.g. a Home-edition SKU with no RDP host capability at all),
  that's recorded as a diagnostic on the section, not a crash.
- A cert bound to more than one of these (e.g. IIS and RDP) appears once, tagged with all of
  them.
- Reported as its own top-level section (not nested under IIS) so renewal tracking doesn't
  require digging through site/binding structure.
- Scope is deliberately still IIS- and RDP-bound certs only, not the whole LocalMachine store
  — a broader sweep (WinRM, SQL Server encryption certs) was considered and explicitly
  deferred, not forgotten.

### 3.10 SQL Server — database-server signal, install-level only

- Instance discovery from the registry only, **no connection to the engine**: edition,
  version/patch level, TCP port, service accounts, install paths, collation.
- Explicitly **not** collecting anything database-level — no database names, sizes, backups.
  Install facts only.

### 3.11 Role classification (computed by the script)

Simple, rule-based tags written into the same output — no separate scoring engine or reader
app, since this script is the whole deliverable:

- **WebServer** — IIS installed with at least one site.
- **DatabaseServer** — a SQL Server instance is installed.
- **DevMachine signal** — .NET SDK and/or Visual Studio present.
- Combine the dev signal with OS installation type to distinguish **DevServer** (Server OS +
  dev signal — a VM built on a Server SKU actually used as a workstation) from **DevLaptop**
  (Windows 11 / Client OS + dev signal).
- A machine can carry more than one tag (e.g. WebServer *and* DevServer) — never forced into
  a single label.

## 4. Output

### 4.1 Per-machine census data

- One JSON file per machine per day: `<CensusRoot>\<MACHINE>\<machine>-census-YYYYMMDD.json`,
  the machine prefix lowercased — so a file copied out of the tree still names its subject.
- Each file is a complete, self-contained snapshot.
- A fact that couldn't be determined (e.g. access denied) is recorded as **unknown**, never
  silently omitted and never reported as a confirmed absence.

### 4.2 Run log — the audit trail

The "mother ship" view of the process itself, separate from what's on each machine: did the
run happen, which machines were reached, when, and what went wrong for the ones that weren't.

- Single accumulating file, **append-only JSON Lines**: `<CensusRoot>\_runs\run-log.jsonl` —
  one entry per line, appended with `Add-Content` as each machine's outcome is known, and
  **never read back by the collector**. Still one file and one read for the whole history.
- **Reversal, 2026-08-11.** The original design was one JSON array, read and rewritten each
  run. It produced three serialization bugs in two weeks, and the third lost data in the
  field: Windows PowerShell 5.1 emits a parsed JSON array as a *single* pipeline object, so
  the read-back's `@(pipeline)` wrapped day 1's entries into one nested
  `{ "value": [...], "Count": n }` element inside day 2's write — under pwsh 7 the same code
  enumerates and works, which is exactly why dev verification passed and the scheduled (5.1)
  run failed. The rewrite mechanism was the fault, not the one-file decision: an append can
  only ever cost the line being written, never the history, and there is no longer any code
  path that deserialises history in PowerShell at all. The array-of-richer-entries argument
  from the original decision is preserved per line (a line is arbitrary JSON); what is given
  up is `run-log` being loadable by a plain JSON parser in one call, which only the reader
  ever did.
- **The file accumulates shapes, and the reader must survive that** *(added 2026-08-07, after
  a stale entry took the app down)*. A line written by an older collector stays in the file
  permanently and no later run will clean it. `CensusStore.GetRunLog()` therefore parses
  **line by line, skipping what no longer fits and logging the count** — a rule that now also
  covers a truncated final line from a crash mid-write. This is the same rule the collector
  already holds itself to (`census-collector.md` §7.2): a failed part records its failure, it
  does not abort the whole.
- Each entry carries `collectorVersion` (`census-collector.md` §6.5). Entries written before
  2026-08-07 have none, which is how a legacy entry is identified.
- **`Repair-CensusRunLog.ps1` is the one-time migration** from a legacy `run-log.json` to
  `run-log.jsonl`. It recovers entries from every shape the old design produced — well-formed
  arrays, the bare-object one-machine shape, and the 5.1 `value`/`Count` nestings, unwrapped
  recursively in file order — then partitions on the *reader's* rule (non-empty `machine` and
  `outcome`, the two required members of `RunLogEntry`), archives what it drops to
  `_runs\run-log.archive-<stamp>.json`, writes the rest as `run-log.jsonl`, and retires the
  legacy file to `_runs\run-log.migrated-<stamp>.json` rather than deleting it. Dry run by
  default; `-Execute` to write. It deliberately does **not** invent a stricter rule than the
  reader's, because a migration that drops rows the application would have accepted is worse
  than the warning it set out to silence. While a legacy `run-log.json` exists with no
  `run-log.jsonl` beside it, the reader logs a warning naming this script — an un-migrated
  tree reads as empty coverage, and that state should announce itself.
- Each entry: machine name, outcome (`ok` / `unreachable` / `failed` + reason), when that
  machine's collection started and finished, and the duration — so "was it successful," "when
  did it run," and "how long did it take" are each a plain field, not something you compute
  yourself from other files.
- One file, opened once, answers the whole history for any machine: its earliest entry is
  when it was first added to the census, and every `unreachable`/`failed` entry is a gap.
  Nothing separate is maintained for "when was this machine added" or "reachability
  history" — both are a scan over this one file, so there's no second source of truth to keep
  in sync.
- A missing per-machine census file for a given day is cross-checked against this log: if the
  log shows `unreachable` for that machine that day, the missing file is explained; if the log
  shows `ok` with no corresponding file, that's a bug worth surfacing, not a silent gap.

## 5. Explicit non-goals

- Not collecting: certificate private keys, SQL Server database contents/backups, IIS
  web.config internals or connection strings, LAPS/BitLocker secrets, any credentials or
  password hashes.
- `Win32_Product` is never called — enumerating it triggers an MSI consistency check and
  self-repair across every installed product on the machine.
- The script never writes anything to a target machine.
- No drift/diff engine, no separate reader application, no credential-bucket model, no
  Standard/Deep/Forensic profiles — this script and its one JSON-per-day output are the
  entire deliverable.

## 6. Open items

- **Retention** — how long to keep daily files before deleting or compressing. Not needed for
  a first working version; revisit once real data volume is known.
- **Machine list shape** — flat list is enough given a single credential/account model; no
  bucket structure needed unless that assumption changes.
- **Target PowerShell version** — `Invoke-Command` over WinRM defaults to the target's
  Windows PowerShell 5.1 endpoint on Server 2016+ and patched 2012 R2. Confirm this holds for
  every machine in the actual list before relying on any 5.1-only cmdlet.
