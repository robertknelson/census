---
# ── minted by the app; do not hand-edit ──
schema: 1
id: census-3754                 # immutable join key — never change this
created: 2026-07-31

# ── required ──
name: census

# ── essence: fill in as the idea forms (all optional) ──
description:
intent: execute a census of the machines
value_prop:
scope:

# ── state ──
phase: discovery
next_step: "Live-fire the credential hop — collector over WinRM against a clixml bucket, interactive with -Verbose, before any schedule trusts it"
standing: underway          # underway|parked|blocked|review — where it sits across the range (docs/STANDING.md)

# ── synthesis ──
themes: []
relates: []
---

## notes

### 2026-08-14 (second session)
- Real data drew blood again, same artery: a payload carrying an explicit
  `"databases": null` overwrites the model's `= []` default at deserialization,
  and `SqlDatabasesOf` threw `ArgumentNullException`. Guarded all five
  envelope-model consumption sites (`DiffEngine`, `HostingController`) with
  `?? []`. NRT never protected this boundary — `<Nullable>enable</Nullable>`
  made the call sites *look* safe, which is arguably worse.
- Decision recorded: census stays on `enable` (flipping sprays CS8632 for no
  gain), but flips to Robert's standard `disable`/`disable` when the code is
  absorbed into his website — open item in `census-web.md` §8.
- `main` at `472b2e2`.

### 2026-08-14
- First contact with real payloads found a crash: registry uninstall entries
  are not unique on `displayName|arch|hive|sid` (SQL Server registers several
  subkeys under one name), so the apps diff's `ToDictionary` threw. Fixed with
  ordinal pairing — an upgrade inside a duplicate group stays a version change,
  not remove+add. Fixture: duplicated SQL Server entry on SQL01.
- `never-collected` now cross-checks the snapshot tree before making its claim;
  files-on-disk-with-no-ok-logged emits `unlogged-collection` (medium) instead.
  New demo machine FILESRV01 carries that story (tree restored, log lost).
- Scaling ratified and largely built: run-log read amplification fixed (one
  read per request, was one per machine), snapshot aging specced then shipped —
  gzip in place after `-AgeAfterDays` (default 90, 0 = off, filename date,
  verified round-trip), yearly `run-log-<yyyy>.jsonl` segments, `.gz`-aware
  reader. Thinning and DB ingestion parked with explicit triggers; dedup
  rejected (breaks absence-is-signal). Spec: `.docs/features/snapshot-aging.md`.
- All pushed; `main` at `48f8ca6`.

### 2026-08-12
- Approved baselines specced, built, verified in the browser, shipped: bless a
  machine's software set as approved for a facet-selected scope, judge every
  machine against the union of matching baselines. Both directions —
  `unapproved-software` (medium) and `missing-required-software` (high).
- Spec: `.docs/features/approved-baseline.md`. Config: `config/baselines.json`
  (empty; real fleet) and `config/baselines.demo.json` (five baselines, the
  fixture set).
- Fixed: every error message in Census.Web had been rendering gray, not red —
  `.est-error` was declared above `.est-status` at equal specificity.
- First dispatch ever filed for this project. The `.trail-boss` files had sat
  as-minted since 2026-07-31 while the collector and the whole web app were
  built, so the board showed nothing.
- `ignite: start-census.bat` declared — the estate now starts from the board.
  Demo fleet by default (the real `output\` tree holds one stale entry, so the
  real profile renders a near-empty estate); `start-census.bat real` for the
  live tree. Both branches exercised through cmd.exe: demo 11 machines, real 1.

### 2026-07-31
-
