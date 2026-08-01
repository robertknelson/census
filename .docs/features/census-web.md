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
  YYYYMMDD.json` plus `output/_runs/run-log.json` plus `config/machines.json`. Census Web
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

Cross-references `config/machines.json` (the intended fleet) against `run-log.json` and what
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
| `apps.entries` | (`displayName`, `architecture`, `hive`, `sid`) | added / removed / `displayVersion` changed |
| `dotnet.coreRuntimes` / `sdks` | the string itself | added / removed |
| `certificates.certificates` | `thumbprint` | added / removed. **Renewal shows as remove+add**, not a single "renewed" event, unless a same-`subject` heuristic is added later (§8) |
| `drives.drives` | `driveLetter` | `percentFree` delta, `healthStatus` changed |
| `sqlserver.instances` | `instanceName` | any field changed |
| `iis.sites` | `name` | `state` changed, binding list changed |
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
- **`dotnet.frameworkReleaseId` blacklist matching** — deferred; needs a release-id → version
  table if it turns out to matter.
- **Version-string parse failures** — confirm "flag for manual review" (§4.2) is the right
  behavior rather than best-effort lexical comparison.
