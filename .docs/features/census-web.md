# Census Web — Requirements

> Status: draft, for discussion. Companion to `.docs/requirements.md` (the collector spec).
> This document **supersedes** one line of that document's §5 non-goals: "no drift/diff
> engine, no separate reader application" was true for phase 1 alone. Phase 2 — this app —
> is that reader, and a drift engine is now explicitly in scope.

## 1. Purpose

Give whoever owns governance/compliance for this estate a place to answer two questions
without opening a single JSON file by hand:

1. **Is any machine out of compliance right now** — running blacklisted software (any
   version) or a blacklisted version of otherwise-approved software?
2. **What changed, and when** — for one machine, browsed across its collected history.

Certificate expiry rides along for free once snapshots are browsable, and gets its own
fleet-wide view because "expires soonest across every machine" is a more useful question than
"what's on this one machine's cert store."

Package-level dependency scanning (npm/NuGet/pip inside deployed apps) is explicitly **out of
scope** — confirmed with Robert 2026-07-31. The collector only ever reports top-level
installed software (`apps`) and .NET runtimes/SDKs (`dotnet`); blacklist matching is scoped to
exactly that.

## 2. Operating model

- **Reads the collector's output tree directly** — `output/<MACHINE>/<machine>-census-
  YYYYMMDD.json` plus `output/_runs/run-log.jsonl` plus `config/machines.json`. Census Web
  never talks to a target machine and never writes into that tree.
- **No database for v1.** At a couple of dozen machines × one file/day, a year of history is a
  few thousand small JSON files — cheap to scan and cache in memory, the same approach
  `LogExplorer` takes over its IIS log tree. Revisit only if the fleet or retention window
  grows by an order of magnitude.
- The census root path is configuration (`appsettings.json`), not a hard-coded path — same
  `Security:AllowedRoots`-style containment `LogExplorer` uses for a user-supplied root is
  worth carrying over once auth is decided (§8).

## 3. Views / functional requirements

### 3.1 Fleet compliance scorecard — the landing page

Not a machine list. The first thing anyone sees is: how many machines have a blacklist hit
right now, broken out by severity, plus a trend line (hit count per day, last N days) so
"are we getting better or worse" doesn't require squinting at a table.

**The trend at 30+ days (2026-10-01, Robert: the old chart "doesn't really handle 30+
days").** It drew a fixed 2.5rem column per collected day with a number and a date under
every bar, so a month overflowed the panel. Now:
- **A real calendar axis.** Every day in the range has a slot; a day nobody was collected
  on is a hatched empty slot, never a zero (the controller's rule: no data is not zero
  hits). Columns share the width and cap at 24px; past 150 days the 2px gaps drop.
- **Range: 30 days (default) · 90 days · All**, ending today, so a stall in collection
  shows as empty slots at the right edge.
- **Labels only where they earn it:** the value at the peak and the latest day; date ticks
  every day up to two weeks, Mondays up to two months, every other Monday up to four, then
  month starts. Everything else is on hover (date, hits, machines with hits, machines
  collected of total) and in **Show as a table**.
- **Machines collected per day** as a grey strip under the bars (a second small chart on
  the same x-axis, not a second y-axis). Total hits rises and falls with how many machines
  reported that day; the strip keeps a low bar on a two-machine day from reading as an
  improvement.
- Verified in Chrome with 80 generated collected days over 121 (the demo tree has three):
  30 days, 90 days and All fit the panel; tooltip and table read correctly.

Open items: **per-machine rate** (hits ÷ machines collected) may be the better y-axis once
real collection is uneven — the strip shows whether it is; **a weekly rollup** past about
a year, where even gapless daily columns get under 2px wide; the trend still re-evaluates
every snapshot on each load (fine at today's size).

### 3.2 Browse machines — latest snapshot

A sortable/filterable list of every machine in `config/machines.json`, each row showing its
**latest** collected snapshot: roles, OS + patch level, pending-reboot flag, blacklist hit
count, soonest cert expiry, last-collected date. One click into a machine's detail view.

### 3.3 Machine detail — history over time

Select a machine, see every collected day for it. Two things, not one:

- **Point-in-time view** of any single day's snapshot (defaults to latest).
- **Diff between any two days** (defaults to latest vs. previous) — see §5 for what's keyed
  and compared.

### 3.4 Certificate expiry radar — fleet-wide

Every certificate from every machine's **latest** snapshot, flattened into one list, sorted by
days-until-expiry. **Recomputed at render time from `notAfter`**, not read from the
collector's `daysUntilExpiry` field — that integer is only accurate as of collection time and
goes stale by however many days have passed since. Filterable by "expires within N days" and
by `boundTo` (an unbound expiring cert is noise; a bound one is a scheduled outage).

### 3.5 Coverage / freshness

Cross-references `config/machines.json` (the intended fleet) against `run-log.jsonl` and what
actually landed in `output/`. Surfaces: machines never successfully collected, machines whose
last `ok` run is more than N days old, and the "log says `ok`, no file exists" bug case called
out in the collector spec §4.2. A stale machine is a compliance blind spot, not a clean bill —
this view exists so that distinction is visible without cross-referencing files by hand.

### 3.6 Compare — "are these machines essentially equal?"

Multi-select machines (role quick-chips: WebServer, DatabaseServer, … — "select a class" is
the primary workflow), machines as columns, grouped rows. Ratified 2026-07-31; deliberately
**shallow** — the view answers "yes, all our database servers are essentially equal," it is
not a deep explorer.

- **Aspects (fixed, slim):** OS, Hardware (CPU/RAM/virtual), Drives, .NET, Installed apps,
  SQL Server (instance edition/patch/port only). **IIS deliberately excluded** — per-site
  detail is noise at this altitude; it lives in the machine detail view.
- **Verdict-first:** each group header announces `identical` or `N differences`; default
  rendering shows **differing rows only** (toggle off to see everything). All headers green =
  the answer, no row-scanning needed.
- **Rows are the union of keyed items** across selected machines (same keys as the diff
  engine, §5); a cell is that machine's value or `—` for absent.
- **Volatile fields never count against equality** — disk % free, pending reboot, SQL service
  state are shown muted but excluded from the verdict, or no two machines would ever be
  "identical." Same principle as §5's drift semantics: operational state is not configuration.
- Comparison basis is each machine's **latest** snapshot, not date-pinned — collection days
  legitimately differ across machines.
- Server-side row assembly (`GET /api/compare?machines=&aspects=`) so union/keying logic
  stays in C# next to the diff engine rather than being duplicated in JS.

## 4. Blacklist model

### 4.1 Storage

`config/blacklist.json`, sibling to `config/machines.json` — operator-owned, versioned the
same way. Editable **both** by hand and through the Blacklist view (§4.4, ratified
2026-07-31, superseding the original "no editor UI" non-goal). The file remains the
artifact; the UX is an editor of it, not its replacement — saves are written pretty-printed
with relaxed escaping so hand-editing stays pleasant, and the evaluator re-reads the file
per evaluation, so edits from either side take effect on the next page load with no restart.

### 4.2 Proposed schema

```json
{
  "version": 1,
  "rules": [
    {
      "id": "BL-2026-001",
      "target": "apps",
      "match": { "field": "displayName", "matchType": "contains", "value": "7-Zip" },
      "version": { "op": "<", "value": "22.00" },
      "severity": "high",
      "reason": "CVE-2022-29072 — org policy #114",
      "active": true
    },
    {
      "id": "BL-2026-002",
      "target": "dotnet.coreRuntimes",
      "match": { "field": "name", "matchType": "exact", "value": "Microsoft.NETCore.App" },
      "version": { "op": "<", "value": "8.0.0" },
      "severity": "critical",
      "reason": "EOL runtime — org policy #97",
      "active": true
    }
  ]
}
```

- **`target`** — `apps`, `dotnet.coreRuntimes`, or `dotnet.sdks`. `dotnet.frameworkReleaseId`
  (the classic .NET Framework release DWORD) is deliberately excluded — matching it needs a
  release-id → version lookup table, and it's not clear yet that anyone still cares about
  Framework versions for compliance. Add it later if that's wrong (§8).
- **`match.matchType`** — `exact` | `contains` | `regex`. Real install names are messy
  (`"GDR 1140 for SQL Server 2022 (KB5058712) (64-bit)"`), so exact-only matching isn't
  enough; `contains`/`regex` cover the rest.
- **`version.op`** — `<`, `<=`, `==`, `>=`, `>`, or omit `version` entirely to ban a name
  outright regardless of version. Comparison assumes dotted-numeric versions
  (`"16.0.1190.2"`); a version string that doesn't parse that way is a rule-evaluation
  failure, not a silent non-match — surfaced as a finding needing manual review, same
  "unknown is never absent" discipline the collector spec uses for its own `status` field.
- **`severity`** — drives the scorecard's breakdown (§3.1); exact tiers are an open item (§8).

### 4.3 Evaluation

Runs against a machine's **latest** snapshot for the scorecard and machine-list views; can
also run against any single historical snapshot from the machine-detail view, since nothing
about it depends on "latest."

### 4.4 Editor (Blacklist view)

Rule-level editing at `#/blacklist`: add / edit / delete / activate-deactivate, each action
persisting immediately via `PUT /api/blacklist` (whole-file replace — the file is small and
the file is the unit of ownership; no rule-level PATCH endpoints).

Server-side validation rejects the write wholesale on: duplicate/empty ids, unknown
target/matchType/op/severity, a `field` invalid for the chosen target, a regex that doesn't
compile, or a version value that isn't dotted-numeric. `reason` is required — a ban without
a recorded why is how rules become unremovable folklore. Deactivating (`active: false`)
keeps the rule and its reason on record; deletion is for rules that were wrong, not rules
that no longer apply.

## 5. Drift / diff semantics

Diffing two snapshots is a keyed comparison per collection, not an index-by-index one —
reordering must never register as a change:

| Collection | Key | What's compared |
|---|---|---|
| `apps.entries` | (`displayName`, `architecture`, `hive`, `sid`) + duplicate ordinal | added / removed / `displayVersion` changed. The tuple is not unique on a real machine (SQL Server registers several HKLM uninstall subkeys under one identical display name, and the collector does not capture the subkey name) — duplicates are ordered by `displayVersion` and suffixed with an ordinal so snapshots pair positionally and an upgrade stays a `displayVersion` change rather than remove+add. Fixture: the duplicated SQL Server 2019 entry on `SQL01` |
| `dotnet.coreRuntimes` / `sdks` | the string itself | added / removed |
| `certificates.certificates` | `thumbprint` | added / removed. **Renewal shows as remove+add**, not a single "renewed" event, unless a same-`subject` heuristic is added later (§8) |
| `drives.drives` | `driveLetter` | `percentFree` delta, `healthStatus` changed |
| `sqlserver.instances` | `instanceName` | any field changed |
| `iis.sites` | `name` | binding list changed, `serverAutoStart` changed, root physical path changed. **Superseded 2026-08-07 — see §9.3**, which drops `state` and adds three IIS collections |
| `os` | n/a (scalar) | `currentBuild`/`ubr` changed (patched), `pendingReboot` toggled |
| `roles` | set | added / removed |

No SHA-256/hash-based change-detection shortcut (the aspirational `plan.md` design has one) —
at this file volume a direct parse-and-compare is cheap enough that the extra machinery isn't
earning its keep yet. Revisit only if it demonstrably isn't.

## 6. Read/write flow

Every view over **census data** (`output/`) is read-only; the app never writes into the
collector's tree. The single write path in the app is `PUT /api/blacklist` → 
`config/blacklist.json` (§4.4). Note for the auth open item (§8): until auth lands, that
write endpoint is as open as the rest of the app.

## 7. Non-goals for this phase
- No authentication/authorization decision made yet (§8) — not skipped by oversight, just not
  yet decided.
- No email/webhook alerting.
- No package-dependency (npm/NuGet/pip) blacklist matching — confirmed out of scope.
- No retention/archival UI for the underlying census files — that's the collector's concern
  (`.docs/requirements.md` §6, still open there too).
- No database.

## 8. Open items

- **Blacklist severity tiers** — exact set (`critical/high/medium/low`? something else?) and
  how they map to scorecard coloring/sorting.
- **Auth/authorization model** — internal, compliance-sensitive tool. `LogExplorer` uses
  Windows/Negotiate + an `AllowedGroups` policy; likely the right default here too, but not
  ratified.
- **Certificate renewal detection** — same-`subject`-new-`thumbprint` heuristic, or accept
  remove+add as the diff representation.
- **`<Nullable>` flip on website absorption** — **Ratified 2026-08-17 (resolved, done ahead
  of absorption).** The original plan was to hold census on `enable` until it was absorbed
  into a website whose csproj is `<Nullable>disable</Nullable>` +
  `<ImplicitUsings>disable</ImplicitUsings>` (Robert's standard), on the argument that
  flipping early sprays CS8632 across the existing `?` annotations for no gain. Robert
  overrode that: it is simply his standard manner of coding, and a repo that reads like his
  other repos is worth more than deferring a mechanical change. Both flags are now `disable`
  on `main`/`nullable-disable`; 292 reference-type annotations and 30 inert `!` operators
  came out with them.

  Two things the flip does **not** change, recorded so they are not re-litigated:
  - **Runtime behaviour.** NRT is compile-time only. Verified by diffing all 20 read
    endpoints on the Demo profile before and after — byte-identical.
  - **The runtime null guards.** They stay exactly as they are. NRT never protected the
    deserialization boundary (the 2026-08-14 `ArgumentNullException` on `instance.Databases`
    proved that), so removing the annotations removes no protection that existed.

  Cost accepted: the annotations carried domain meaning in a codebase whose thesis is that
  absence is signal (`string CollectorVersion` no longer says "null means unknown shape").
  That documentation now lives only in the XML comments and this file.

---

## 9. IIS payload v2 — reader sync (W0 + W1)

> **Ratified 2026-08-07.** The collector's IIS payload was rewritten
> (`.docs/features/census-collector.md` §8.6): application-shaped, with app pools, runtime
> markers, authentication, dependency edges and log directories. This section is what the
> **reader** does with it. Scope is deliberately W0 + W1; W2 and W3 are named in §9.7 and are
> not in this slice.

### 9.1 Why this is not optional

`System.Text.Json` silently ignores unmapped properties, so an unchanged reader does not
break — it goes quiet. The collector gets five times richer and the UI renders identically.
That failure mode is worse than a crash, because nothing announces it.

Four consumers assume the old three-field shape: `CensusEnvelope.cs` (`IisData`/`IisSite`/
`IisBinding`), `DiffEngine.DiffIisSites`, `machine-dossier.mjs`, `machine-detail-view.mjs`.

### 9.2 Model — `Models/Census/CensusEnvelope.cs`

| Record | Carries |
|---|---|
| `IisData` | `Server`, `Sites`, `AppPools`, `Applications`, `Dependencies` |
| `IisServer` | version, config path, `ConfigLastWriteUtc`, `ConfigSha256` |
| `IisSite` | `Name`, `Id`, `ServerAutoStart`, `PhysicalPath`, `Bindings`, `LogFile` |
| `IisBinding` | existing five fields **plus** parsed `Ip`, `Port`, `HostHeader`, `Parsed` |
| `IisAppPool` | runtime version + source, pipeline mode, identity type + source, user name |
| `IisApplication` | site, path, physical path, pool + denormalized pool facts, `Runtime`, `Auth`, `VirtualDirectories`, `Status`, `Reason` |
| `IisVirtualDirectory` | path, physical path, user name, logon method |
| `IisRuntime` | pool runtime version, `AspNetCore`, `HasAppSettingsJson`, `HasRuntimeConfigJson` |
| `IisAspNetCore` | process path, arguments, hosting model, environment variables |
| `IisAuthSetting` | `Enabled`, `UserName`, `Source` — one per auth type |
| `IisLogFile` | config fields + `Stats` |
| `IisDependency` | flat edge: keys, `Kind`, plus both database and http fields |
| `ExpandedPath` | `Raw`, `Expanded`, `Expandable` |

Decisions:

- **`State` is dropped, not sourced.** `applicationHost.config` has no `state` attribute on
  `<site>` — runtime state lives in WAS and needs `appcmd list site`, deferred in collector
  §8.6.10. The field has been null in every real payload the collector could ever have
  produced; only the hand-written demo files ever carried a value. **Never fabricate it.**
- **`ExpandedPath` is one record used four ways** (site root, application root, virtual
  directory, log directory). The `Raw`/`Expanded` pair exists so an unexpandable variable
  stays visible; flattening it to a string would throw that away.
- **`Dependencies` is one flat list with a `Kind` discriminator**, not separate typed
  collections. It matches the payload, keeps one diff key, and keeps the W2 pivot a single
  pass.
- Everything nullable, every collection defaulted. A category can be `not-present` or
  `failed`, and §6.1 of the collector spec is binding on this reader: **read
  `collectors.X.status` before touching `data`.**

### 9.3 Diff — `Services/DiffEngine.cs`

Supersedes the `iis.sites` row in §5.

| Section | Key | Compared |
|---|---|---|
| `iisSites` | `Name` | binding count, `ServerAutoStart`, root physical path. **`State` comparison removed** — it can never fire |
| `iisAppPools` | `Name` | `ManagedRuntimeVersion`, `ManagedPipelineMode`, `IdentityType`, `UserName` |
| `iisApplications` | (`SiteName`, `Path`) | pool, physical path, runtime marker, auth enabled-state per type |
| `iisDependencies` | (`SiteName`, `AppPath`, `SourceFile`, `Kind`, `Name`) | the resolved target — host / instance / port / database, or scheme / host / port / path |

> **Log statistics must not be diffed.** `TotalBytes`, `FileCount`, `NewestUtc` and
> `Last24hBytes` change every single day by design. Diffing them turns the changes feed into
> noise and buries the real findings. Only log *configuration* — enabled, directory, format,
> period — is compared. This is the volatile-field rule (collector §6.3) applied at the reader.

Section labels are duplicated in `changes-feed.mjs` and `machine-history.mjs`; both get the
four new keys.

### 9.4 Dossier — `wwwroot/js/estate/machine-dossier.mjs`

The IIS section becomes five blocks, in this order — most-asked first:

1. **Server** — IIS version, config last-write, short config hash.
2. **Applications** — the primary table: site, virtual path, runtime badge, pool + identity,
   auth, physical path. This is the block that answers the daily question.
3. **Sites** — bindings (protocol, ip:port, host header, cert chip) and the log line.
4. **App pools** — name, runtime, pipeline mode, identity.
5. **Dependencies** — grouped by kind, remote before local.

Rendering rules, stated here because the collector deliberately does not decide them:

- **The runtime badge is a reader derivation** (collector §8.6.5 emits three raw signals and
  picks no winner). The rule lives in one function so it stays revisable:
  `aspNetCore` present → `Core` + hosting model; else `managedRuntimeVersion == ""` →
  `No Managed Code`; `v2.0` → `.NET Framework 2.0/3.5`, flagged; `v4.0` →
  `.NET Framework 4.x`.
- **Authentication is never collapsed to a single mode.** Anonymous and Windows are
  independently enableable and commonly both on. Render a chip per type; the merge `source`
  (`serverDefault` / `location` / `webConfig`) belongs in a tooltip, not the main line.
- **Remote dependency edges outrank local ones.** `isLocal` edges are rendered muted — an app
  talking to its own box is a dependency, but it is not the one that matters for blast radius.
- **`secretsPresent` renders as a warning chip and never a value.** Same for `hadCredentials`
  / `hadQuery` on http edges.
- **An application whose `status` is not `ok` renders its `reason` inline**, never as a blank
  row. Unknown is never absent.
- **`Expandable == false` is shown**, not silently hidden — an unexpanded `%VAR%` in a
  physical path means the reader is looking at a path that does not resolve.

### 9.5 v1 view — `wwwroot/js/census/views/machine-detail-view.mjs`

Minimal change only: drop the dead `state` column, add an application count. v1 is not being
re-imagined (v2-UX §1); it merely must not display a column that can never have data.

### 9.6 Demo data — `output-demo/`

**Fabricated, and permanently so** (ratified 2026-08-07): no real IIS run is reachable from
this environment and none can be imported. The existing files assert `state: "Started"`, which
the collector cannot produce — that is the specific lie being retired.

Regenerated by hand on `WEB01`, `WEB02` and `APPSRV01` (the IIS boxes; the others keep
`not-present`). The fabricated set must cover every branch the views have to render, or W1
gets built blind:

> **Three generators, and the order matters.** `tests/New-DemoMachines.ps1` creates the base
> envelopes (identity, os, memory, drives, apps, certificates) and must run **first**;
> `New-DemoIisData.ps1` and `New-DemoSqlData.ps1` then patch the `iis` and `sqlserver`
> categories over the placeholders it wrote. Neither of the latter two can create a machine —
> they only rewrite files that already exist, which is why adding one needed a third script.

- a .NET Framework `v4.0` application and a `v2.0` legacy pool
- an ASP.NET Core application, `hostingModel` in-process, with `ASPNETCORE_ENVIRONMENT`
- a `SpecificUser` pool identity with a domain account
- Windows auth arriving from `location` on one app and from `webConfig` on another
- a UNC virtual directory
- a static site with **no** `web.config` — `not-present`, status still `ok`
- database edges both local (`.`/`(local)`) and remote, one with `secretsPresent`
- an http edge, and one with `hadCredentials`/`hadQuery`
- a site with logging disabled, and one whose `newestUtc` is stale

Added with `WEB02` (2026-08-07), the second dedicated web box:

- **`hostingModel: "outofprocess"`** — `WEB01`'s ASP.NET Core application is in-process
- **a self-contained `processPath`** — a bare `.exe` rather than `dotnet`, which §8.6.5 makes
  the framework-dependent/self-contained discriminator
- **anonymous *and* Windows *and* basic all enabled on one application.** Legal and common,
  and precisely the case §8.6.6 forbids collapsing into a single "auth mode"
- **a dependency edge the parser did not understand** — `parseStatus: "unrecognized"` with a
  null `host`, which §8.6.7 requires instead of a guess. Every pre-existing edge is `ok`
- **an already-expired certificate**, bound to a **stopped site**. `WEB01` only has one
  expiring in 15 days; expired is a different render, and the expired-cert-on-a-dead-site
  pair is the shape an estate accumulates without anyone noticing
- a `Classic` pipeline pool running as a **domain account** (`WEB01`'s Classic pool is
  `NetworkService`, so the combination carrying a rotation obligation was absent)
- `apps` at **`insufficient-rights`** rather than `failed` — `BUILDSRV01` covers `failed`,
  and §6.2 requires the two to render differently: one is "it broke", the other is
  "truth unknown"
- the only **physical** machine in the tree (`isVirtual: false`, no hypervisor signals), so
  the negative branch of the virtualisation panel renders

> **`WEB01` has two snapshots (2026-07-30 and -31) and they must differ in at least one
> diffable IIS field**, or the changes feed and history view have nothing to render and the
> new diff sections ship unverified. `WEB02` holds to the same rule: its pair promotes a pool
> identity to a domain account and adds an outbound partner edge.

### 9.7 Deliberately not in this slice

- **W2 — the pivots.** "Where is application X hosted?" and "What depends on database Y?",
  derived from `software-panel.mjs`'s existing shape. The second is the blast-radius question
  in miniature and is the same projection graph-interop §5 will export — built as a view
  first, extracted later, not speculated now.
- **W3 — findings.** `ASPNETCORE_ENVIRONMENT=Development` in prod, `v2.0` pools,
  `SpecificUser` domain identities as a credential inventory, `secretsPresent` connection
  strings, log directories on the OS drive. Entangled with **stage-aware severity**, already
  parked in v2-UX §7.
- **The export endpoint** (graph-interop §5).

### 9.8 Decisions

| | Decision |
|---|---|
| **W-1** | `IisSite.State` dropped, never fabricated; `ServerAutoStart` is the config truth. |
| **W-2** | The dossier's IIS section is application-first, mirroring the payload shape. |
| **W-3** | The runtime badge is a reader derivation in one function, because the collector deliberately emits raw signals and picks no winner. |
| **W-4** | Log statistics are excluded from diffing as volatile; log configuration is diffed. |
| **W-5** | `output-demo/` is fabricated permanently, and must cover every render branch. |

---

## 10. SQL payload v2 — reader sync (S0 + S1)

> **Ratified 2026-08-07.** The `sqlserver` collector now connects and returns databases and
> database files (`.docs/features/census-collector.md` §8.8.1). This section is what the reader
> does with it. Same split as §9: S0 stops the silence, S1 surfaces it. S2 and S3 are named in
> §10.6 and are not in this slice.

### 10.1 What the reader is missing

Four consumers assume the registry-only shape: `SqlInstance` in `CensusEnvelope.cs`,
`DiffEngine.DiffSqlInstances`, the dossier's SQL section (`machine-dossier.mjs:338`), and
`CompareEngine`. As in §9.1, an unchanged reader does not break — it goes quiet.

The new payload adds, per instance: `connectedStatus`, `connectedReason`, `permissions`,
`serverProperties`, `databases`, `databaseFiles`.

### 10.2 Model — `Models/Census/CensusEnvelope.cs`

| Record | Carries |
|---|---|
| `SqlInstance` | existing registry fields **plus** `ConnectedStatus`, `ConnectedReason`, `Permissions`, `ServerProperties`, `Databases`, `DatabaseFiles` |
| `SqlPermissions` | `LoginName`, `IsSysadmin`, `ViewAnyDefinition`, `ViewServerState` |
| `SqlServerProperties` | `ProductVersion`, `Edition`, `ServerCollation` |
| `SqlDatabase` | name, id, state, recovery model, compatibility level, collation, read-only, encrypted, owner, create date |
| `SqlDatabaseFile` | database, file id, type, logical name, physical name, directory, size pages/bytes, max size, growth, percent growth, `IsUnc` |

**Registry discovery and connected data stay separate.** `Edition` from `Setup` and
`ServerProperties.Edition` from `SERVERPROPERTY` are different observations of the same thing
and can legitimately disagree — a patched instance reports one version in the registry and
another from the engine. Do not merge them; the disagreement is informative (§8.10 makes the
same argument for the three memory figures).

### 10.3 Diff — `Services/DiffEngine.cs`

| Section | Key | Compared |
|---|---|---|
| `sqlInstances` | `InstanceName` | existing four, **plus** `ConnectedStatus` and `ViewAnyDefinition` |
| `sqlDatabases` | (`InstanceName`, `DatabaseName`) | state, recovery model, compatibility level, read-only, encrypted, owner |
| `sqlDatabaseFiles` | (`InstanceName`, `DatabaseName`, `LogicalFileName`) | physical path, max size, growth, percent growth |

Keys are already fixed in collector §6.4 — **not** `database_id` (reused after a drop), **not**
`physical_name` (changes when a file is moved, which is the change you want to *see*).

> **File sizes must not be diffed.** `SizePages` and `SizeBytes` grow continuously; diffing
> them would make every database on every server appear changed every day and bury the real
> findings. `MaxSize`, `Growth` and `IsPercentGrowth` are *configuration* and are compared.
> This is the volatile-field rule (collector §6.3) — the same call as W-4 for IIS log statistics.

**Diffing `ViewAnyDefinition` is deliberate.** The permission stamp exists because a rights
change silently shrinks the database list. Surfacing the stamp flipping to `false` in the
changes feed is what turns that from a silent shrink into an event — the whole reason the
collector emits it.

### 10.4 Dossier — `wwwroot/js/estate/machine-dossier.mjs`

The SQL section keeps its instance card and gains three blocks:

1. **Instance** — existing facts, plus connected status and the login the census used.
2. **Databases** — filterable table: name, state, recovery model, compatibility, owner, flags.
3. **Storage** — files grouped by directory, answering "where does data actually live on this
   box", with sizes.

Rendering rules:

- **`insufficient-rights` must never render as an empty list.** If `ViewAnyDefinition` is
  false the block shows the permission failure and the login name — not "0 databases". This is
  the single rule the whole permission stamp exists to enable; getting it wrong here wastes
  the collector-side work entirely.
- **`connectedStatus` other than `ok` renders its reason inline** — `skipped` for a stopped
  service is a normal, expected state and should read as such, not as an error.
- **Non-`ONLINE` databases are flagged.** `OFFLINE`, `RESTORING`, `SUSPECT` and
  `RECOVERY_PENDING` are findings on sight.
- **System databases are shown but muted.** `master`, `model`, `msdb`, `tempdb` are four rows
  of noise in a list of twenty — but their *file locations* genuinely matter, so they are
  de-emphasised rather than hidden.
- **The login name is always shown; missing rights are shown loudly.** Silence means the
  census saw everything. Who observed it is an audit fact worth carrying even when it worked.
- **UNC file paths are flagged** — they are a cross-machine dependency (collector §8.9).
- **Filter box reuses the installed-software pattern** (`est-filter` + scroll container). A
  production instance can carry hundreds of databases; the apps table already solved this and
  the solution is already approved.

### 10.5 Demo data — `output-demo/`

`SQL01` is the database box and carries the new payload; `WEB01` and `APPSRV01` keep
registry-only discovery with `connectedStatus`. Fabricated permanently, per W-5.

Branches the fabricated set must cover, or the views get built blind:

- an instance where the census had full rights, and **one where `ViewAnyDefinition` is false**
  so the `insufficient-rights` path renders
- a **stopped** instance, so `skipped` renders
- an `OFFLINE` database alongside `ONLINE` ones
- system databases mixed with user databases
- data and log files in **different directories**, and one file on a **UNC path**
- a database with `SIMPLE` and one with `FULL` recovery
- a database owned by a personal account rather than `sa`

Added with `SQL02` (2026-08-07), the second dedicated database box — every instance on
`SQL01` is *named*, so these two could not be reached from it:

- **the default instance.** `instanceName` is `MSSQLSERVER` and the string anything connects
  to is the bare host name — `SQL02`, no backslash — so its `sqlInstance` alias is the host
  name itself (`census-collector.md` §8.1.1). A reader that assumes `HOST\INSTANCE`
  everywhere renders this wrong, and nothing in the tree would have caught it.
- **`connectedStatus: "timed-out"`.** `SQL01` covers `ok`, `insufficient-rights` and
  `skipped`. A connection that hung is a fourth outcome with a different remediation — the
  instance may be perfectly healthy and merely busy, so the truth is unknown rather than bad.
- an instance at an older major version (2016, compatibility level 130) beside `SQL01`'s
  2019/160, so version spread across the estate has something to render.

> ~~`SQL01` has only one snapshot today.~~ **Closed 2026-08-07.** `SQL01`, `SQL02`, `WEB01`,
> `WEB02` and `BUILDSRV01` all carry two dates now, each differing in at least one comparable
> field. `SQL02`'s pair moves a database's compatibility level and adds an audit database
> with its files.

### 10.6 Deliberately not in this slice

- **S2 — the storage pivot.** "Where does database X live across the estate", derived from
  `software-panel.mjs` exactly as the IIS pivots would be.
- **S2 — the corroboration join.** IIS dependency edges claim `SQL01\PROD / Portal`; SQL01's
  census can now *confirm* that database exists. This is the graph-interop §7 class-1
  contradiction detector and deserves its own slice rather than being smuggled into a dossier.
- **S3 — findings.** `OFFLINE` database, data and log on the same volume, database file on the
  OS drive, `SIMPLE` recovery on something that looks like production, personal-account
  database owner, permission stamp regression. Entangled with stage-aware severity, parked in
  v2-UX §7.

### 10.7 Decisions

| | Decision |
|---|---|
| **S-1** | Registry discovery and connected `SERVERPROPERTY` data are kept as separate observations; disagreement between them is informative and is never merged away. |
| **S-2** | File sizes are excluded from diffing as volatile; file configuration is diffed. |
| **S-3** | `ViewAnyDefinition` is a diffed field, so a rights regression surfaces as an event. |
| **S-4** | `insufficient-rights` renders as a permission failure, never as an empty database list. |
| **S-5** | System databases are muted, not hidden — their file locations still matter. |

---

## 11. Estate pivots — Hosting (W2 + S2)

> **Ratified 2026-08-07.** The pivots deferred in §9.7 and §10.6. Derived from
> `software-panel.mjs`, which already answers "where is X installed?" in 74 lines — the shape
> is approved, so it is reused rather than reinvented.

### 11.1 One panel, three questions

The header carries four buttons already; three more would make seven. These are three facets of
one question — **what runs where, and what talks to what** — so they are one panel, `Hosting`,
with three views.

| View | The question |
|---|---|
| **Applications** | Where is application X hosted, and is one box on an odd runtime? |
| **Databases** | Where does database X live? |
| **Dependencies** | What talks to Y — and if Y goes down, what breaks? |

### 11.2 One endpoint, one pass

`GET /api/hosting` returns all three aggregations. `CensusStore` reads and deserialises a JSON
snapshot per machine; computing the three separately would read every machine three times for
no benefit. Latest snapshot only, like `/api/software` — the button is disabled under an as-of
date for the same reason Changes and Software are.

### 11.3 Applications — the runtime-spread pivot

Grouped by **(site name, application path)**, because that is the identity that repeats across
a web farm; two machines serving `portal.example.com/` are the same application.

Each row carries the machines hosting it and a **runtime spread badge** when they disagree —
the direct analogue of the software panel's "N versions" badge, and the same question: *which
box is the odd one out.* An application running `v4.0` on one node and `v2.0` on another is a
finding that no per-machine view surfaces.

Also shown: app-pool identity per machine (a farm where one node runs as a different account
is a finding), and physical path.

### 11.4 Databases — where data lives

Grouped by **database name** across every instance on every machine. Shows the hosting
instances, state, and file directories.

**A spread badge when the same database name appears on more than one instance.** That is
either a legitimate replica or a forgotten restore, and both are worth knowing. System
databases are excluded from this pivot — `master` on twelve machines is noise, and unlike the
dossier there is no file-location argument for keeping them.

### 11.5 Dependencies — the blast-radius view

Grouped by **target**, not by source. The row is the thing depended upon; the children are
everything census has observed pointing at it. That inversion is the whole point: census
collects downstream edges, and blast radius needs upstream (`graph-interop.md` §6.1).

#### Corroboration — the first cross-machine inference

Each target gets a verdict, and this is the payoff named in §10.6:

| Verdict | Meaning |
|---|---|
| `confirmed` | A censused machine matches the target host **and** reports a database of that name. The claim parsed from a web server's config is corroborated by the database server's own census. |
| `contradicted` | A censused machine matches the host, but reports **no** such database. A real finding — the connection string points somewhere that does not exist. |
| `unobserved` | No censused machine matches the host. **Not an error** — census simply cannot see it (§6.2, and `graph-interop.md` invariant 3). |

> **`unobserved` must never render as a problem.** Most targets in a real estate will be
> unobserved, because census reaches a subset of the world. It is a statement about census's
> coverage, not about the dependency.

**Host matching is by machine name only, for now** — directory name, `computerName`, and
`requestedName`, case-insensitive, plus the instance segment of `HOST\INSTANCE`. This is
exactly what the `aliases` collector (collector §8.1.1, still unbuilt) exists to improve: once
it lands, an edge naming `sql01.corp.local` or a certificate SAN will match too. Until then a
target named by FQDN where the machine is censused by short name will read `unobserved` — a
false negative, and one that only ever *understates* what census knows.

HTTP edges are not corroborated in this slice. Confirming them means matching a URL host
against IIS bindings across the estate, which is a second matching problem and belongs with
the alias work.

### 11.6 Rendering rules

- **Remote before local, and local muted** — same rule as the dossier. An app talking to its
  own box is a dependency, but not the one that matters for blast radius.
- **Machine names are buttons that open dossiers**, exactly as in the software panel. The
  pivot exists to get you to the machine.
- **`contradicted` is loud, `unobserved` is quiet.** The verdict vocabulary is worthless if
  the UI renders census's blind spots as failures.
- **Secrets never surface** — `secretsPresent`, `hadCredentials`, `hadQuery` remain booleans.
- Every view has the search box the software panel has; the estate will not stay small.

### 11.7 Deliberately not in this slice

- HTTP edge corroboration against IIS bindings (see §11.5).
- Alias-based host matching — blocked on collector §8.1.1.
- A graph/topology rendering. This is a list, and a list is what answers the question today; a
  diagram is the dependency-graph system's job (`graph-interop.md` §1).
- Findings derived from these pivots (runtime spread, contradicted dependency) — that is S3/W3,
  entangled with stage-aware severity.

### 11.8 Decisions

| | Decision |
|---|---|
| **H-1** | One `Hosting` panel with three views, one endpoint, one pass over the snapshots. |
| **H-2** | Applications pivot on (site, path); runtime spread is the finding, derived from the software panel's version-spread idea. |
| **H-3** | Dependencies group by target, not source — census collects downstream, blast radius needs upstream. |
| **H-4** | Three-state corroboration; `unobserved` is a statement about census coverage and is never rendered as a fault. |
| **H-5** | Host matching is by machine name until the alias collector lands; it may only understate what census knows, never overstate. |
- **`dotnet.frameworkReleaseId` blacklist matching** — deferred; needs a release-id → version
  table if it turns out to matter.
- **Version-string parse failures** — confirm "flag for manual review" (§4.2) is the right
  behavior rather than best-effort lexical comparison.

## 12. Board scope carried into the fleet panels

> **Ratified 2026-08-28.** He liked the team filter and asked whether it could reach
> Changes, Software, Hosting, and Certificates. It can, client-side, with no server change.

**Rule:** what the board shows is what a fleet panel lists. `panelScope()` on the page
is `null` when no owner and no class is selected (panels read the whole fleet, as they
always did); otherwise the set of machines the board is rendering — owners, then class,
then stage, the same `visibleMachines()` + `stageMatches()` the tiles use. The four panels
take a `getScope` thunk (`panel-scope.mjs`), filter on it at render, and the page calls
`fleetPanel.refresh()` from `renderAll()` so a rail click re-scopes the open panel in
place — no refetch, no reopen.

**Per panel, where the knife goes:**
- Changes — drop machines out of scope.
- Software — drop out-of-scope machines from each version, drop emptied versions and
  applications, recount `machineCount` and `unapprovedOn` against what is left.
- Hosting — cut on the machine that hosts the row: application/database instances, and
  a dependency's **sources**. A consumer in scope shows its target wherever the target
  lives, because the question is "what do my machines depend on," not "what lives here."
- Certificates — cut **before** thumbprint grouping, so a cert on six machines reads as
  "on two of yours."

**Say it on screen:** a scope line above the list — `scoped to PublicApps · 4 machines
[show fleet]` — so a short list never reads as a small fleet. `show fleet` is a
panel-local escape (the board does not change); it resets when the panel reopens.
Deliberately no per-panel scope editor: the rail is the one place scope is chosen.

### 12.1 Triage and Findings join the scope (2026-10-01, Robert: "spec triage and findings, go")

He asked for the board's team/class filter on the tabs "to make the work more manageable".
Changes, Software, Hosting and Certificates already had it (§12); Triage and Findings did
not, and Findings carried its own owner chips — a second place to choose scope, which §12
ruled out. Same rule, same scope line, same `show fleet` escape.

**Triage — where the knife goes:**
- **Machine cards** — only machines in scope, including a card pinned there only by an
  unknown collection (unknown-never-hidden governs strata, not scope).
- **Unresolved endpoints** — cut on the edge's **source** machine, as Hosting cuts a
  dependency: "what are my machines pointing at that nobody has named?" A group whose
  edges all fall out goes.
- **External declared entities** have no machine, so they are not on the board: hidden
  while scoped, with a line saying how many and that `show fleet` shows them — never
  silently absent.
- **Selection follows the screen.** A rescope drops selected rows that left it, so *Apply
  to N* only ever touches rows the user can see.
- **The count** reads *38 unclassified fleet-wide · 6 in scope*. The toolbar's Triage
  button stays fleet-wide, like the Certificates button.
- The Declare form's machine list stays the whole fleet: declaring is not filtering.
- `refresh()` re-renders against the scope (the page calls it from `renderAll()`, e.g.
  after an apply re-reads the canvas); re-reading the pile itself is `reload()`.

**Findings:**
- Cut on the finding's machine. Severity chips count what is in scope.
- **The owner chips are removed** — the rail is the one place scope is chosen (§12). Owner
  badges stay on each row.
- The toolbar's *Findings · 22 (4 critical)* stays fleet-wide: the alarm does not shrink
  because a team is picked.
- **Export CSV stays the whole fleet** (it is audit evidence, `/api/export/compliance.csv`)
  and says so on the button.
- It becomes the page's `fleetPanel`; `refresh()` re-reads findings from the current
  canvas.

**Found while verifying (true of every fleet panel, unchanged):** the panel's backdrop
covers the rail, so a rail click closes the panel rather than rescoping it in place — the
scope is the board's at the moment the panel opens, and inside it only `show fleet`
changes it. §12's "a rail click re-scopes the open panel" never happened by mouse.

**Verified 2026-10-01 in Chrome on the demo fleet,** board *Unassigned · Web server*
(5 machines): Triage listed DEVWEBBOX, PRODWEBBOX, VALWEBBOX, WEB01, WEB02 and read
*38 unclassified fleet-wide · 13 in scope*; *show fleet* gave 10 cards; with APPSRV01 and
WEB01 ticked (*Apply to 9*), scoping back left *Apply to 4*; the 2 external entities were
counted as outside the scope. Findings showed 6 rows on WEB01/WEB02 (critical 2, medium 3,
low 1) against 22 fleet-wide; no owner chips; *Export CSV (whole fleet)*. Not seen on the
real estate.

**Open items**
- Whether Export CSV should offer a scoped export too (a query parameter on the endpoint).
- ~~Whether the rail should stay clickable with a panel open~~ — yes, §12.2.

### 12.2 The scope controls stay live while a panel is open (2026-10-01, Robert: "make the rail stay clickable with a panel open")

§12 meant a rail click to rescope the open panel; the backdrop covered the rail and closed
the panel instead. Now, while a panel is open, the **team rail, the class legend and the
stage bar sit above the backdrop** (undimmed, so they read as live) and a click on them
rescopes the open fleet panel in place. Everything else under the backdrop still closes
the panel on click.

- **A new scope choice clears the panel's `show fleet`.** Picking a team is asking for that
  team; the escape was for the previous scope.
- The stage bar now refreshes the open panel too (it re-rendered only the canvas before).
- Panels that are not fleet panels (a dossier, blast radius, baselines, prohibited) stay
  open while the board changes underneath them.

**Verified 2026-10-01 in Chrome on the demo fleet,** Findings open on *Unassigned · Web
server*: *prod* → *Unassigned · WebServer · prod · 3 machines*, panel still open; Web
server off and team-a on → *Unassigned · team-a · prod · 11 machines*; *show fleet*, then
Unassigned off → *team-a · prod · 1 machine* (the escape cleared); a click on the dimmed
board still closed the panel.
