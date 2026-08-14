---
# ── the app reads exactly these; everything else is yours ──
summary: "Aging shipped — gzip at 90 days, yearly run-log segments; first real-data contact found and killed a diff crash"
resume: "cd Census.Web; $env:ASPNETCORE_ENVIRONMENT='Demo'; dotnet run   # then http://localhost:5199"
health: green
links:
  - { label: "GitHub", url: "https://github.com/robertknelson/census" }
phase_suggestion: execution
ignite: start-census.bat
#
# ignite runs blind from the repo root in cmd.exe (`wt -d <dir> cmd /k <command>`),
# so it is a .bat, not PowerShell. Defaults to the DEMO fleet: this repo's real
# output\ tree holds one stale entry, so the real profile renders a near-empty
# estate and a board click would look broken. `start-census.bat real` for the
# real tree.
#
# what the owner wants kept visible: NOT YET ASKED (contract rule 7).
# Standing guess until he says otherwise: build health, the one live-verification
# gap, and the next unblocked move.
---

## Where it stands

Two halves, both built. **The collector** (`Invoke-Census.ps1` + `collectors/`)
runs from one control box over WinRM, writes one JSON snapshot per machine per
day, appends an audit line per machine to yearly `_runs/run-log-<yyyy>.jsonl`
segments, and now **ages its own tree**: snapshots older than `-AgeAfterDays`
(default 90, `0` = off) gzip in place — encoding changes, existence never does,
so absence stays signal. **Census.Web** reads that tree (`.gz`-transparent) and
renders the estate: owner → stage → glyph canvas → dossier, with a findings
stream recomputed on every read.

## This session (2026-08-14)

- **Real data landed a punch.** Registry uninstall entries are not unique on
  `displayName|arch|hive|sid` — SQL Server registers several HKLM subkeys under
  one identical display name — and the apps diff crashed on `ToDictionary`.
  Fixed with ordinal pairing inside duplicate groups; an upgrade stays a
  `displayVersion` change, not remove+add.
- **`never-collected` tells the truth now.** It cross-checks the snapshot tree;
  files on disk with no ok logged read as `unlogged-collection` (medium, a
  provenance problem) instead of a false "never collected" (high). Demo machine
  FILESRV01 added as the fixture: tree restored from backup, run log lost.
- **The scaling conversation happened and mostly shipped.** Run-log read
  amplification fixed (was one full parse per machine per request — quadratic in
  fleet size). Snapshot aging specced (`.docs/features/snapshot-aging.md`),
  ratified (`-AgeAfterDays 90`), built, and live-verified including the
  interrupted-aging recovery path. Retention thinning and DB ingestion parked
  behind explicit triggers; write-only-on-change dedup **rejected** — it would
  overload absence-is-signal.

## Blockers

- **The credential hop has never been exercised.** No remote WinRM call
  carrying `-Credential` has run — one machine, one account in this
  environment. The first real run against a `clixml` bucket *is* the test and
  should be interactive with `-Verbose`. This is `next_step`.
- **No full real payload tree is reachable here** — though real data has now
  brushed the system once (the SQL Server duplicate crash came from a genuine
  envelope) and immediately earned its keep. Every render branch still needs a
  deliberate fixture; five coverage gaps caught that way so far.

## Parked, with reasons in the docs

- Retention thinning (keep month-end beyond a horizon) — policy, Robert sets
  the horizon; `snapshot-aging.md` §7.
- DB ingestion — trigger: findings/estate reads exceeding ~1s at real fleet
  size. Not before.
- Stage-aware severity; severity tiers unratified — `census-web-v2-ux.md` §7.
- Host-app import — `.docs/host-import-manifest.md`, waiting on the host.

## Where the reasoning lives

`.docs/features/` — one file per feature, each with business rules, schema
decisions *with the why*, and an open-items section. `snapshot-aging.md` is
the newest. `.docs/requirements.md` is the collector spec.
