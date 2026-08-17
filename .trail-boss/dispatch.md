---
# ── the app reads exactly these; everything else is yours ──
summary: "Pivot to the system graph — concepts drafted, blocked on one boundary call Robert owns"
resume: "cd Census.Web; $env:ASPNETCORE_ENVIRONMENT='Demo'; dotnet run   # then http://localhost:5199"
health: green
links:
  - { label: "GitHub", url: "https://github.com/robertknelson/census" }
phase_suggestion: planning
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

Two halves built and shipping. **The collector** (`Invoke-Census.ps1` +
`collectors/`) runs from one control box over WinRM, writes one JSON snapshot
per machine per day, appends an audit line to yearly `_runs/run-log-<yyyy>.jsonl`
segments, and ages its own tree (gzip past `-AgeAfterDays`, default 90).
**Census.Web** reads that tree and renders the estate: owner → stage → glyph
canvas → dossier, findings recomputed per read.

**A third thing started this session, and it is where the energy is now:** the
**system graph** — classifying observed entities into composite applications so
blast radius can be answered. Spec: `.docs/features/system-graph.md`. It is
**blocked on one question**, see below.

## This session (2026-08-17)

**Housekeeping, done and pushed.**

- `<ImplicitUsings>disable</ImplicitUsings>` + `<Nullable>disable</Nullable>` —
  Robert's standard csproj settings, applied ahead of website absorption rather
  than at it (he overruled the earlier "wait" decision: it is simply how he
  codes). 292 NRT annotations and 30 inert `!` operators removed, driven off the
  compiler's own warning positions and audited so no ternary, `?.`, `??` or `!=`
  was touched. **All 20 read endpoints byte-identical before and after** — NRT
  is compile-time only. The `census-web.md` §8 open item is resolved.

**The new work.**

- **Fixture: a three-stage WebApp→DB topology.** DEVWEBBOX / VALWEBBOX /
  PRODWEBBOX / DEVSQLBOX / PRODSQLBOX, two snapshots each. Twelve dependency
  edges, all corroborating `confirmed`; **eight land on DEVSQLBOX**, which serves
  DEV and VAL both — a single point of failure spanning two stages that no
  per-stage view reveals. Generator: `tests/New-DemoStageTopology.ps1`.
- **Naming traps planted permanently.** Robert surfaced a scar: in fall 2025 he
  built a graph from naming conventions, it worked for most of a real estate, and
  died on the minority that did not conform — the killer being **ambiguity, not
  absence** (`MyDB_DEV` unresolvable once `MyDatabase_DEV` also existed). A
  fixture whose names all obey the convention cannot catch code that quietly
  parses names, so the fixture now carries the collision itself, a database whose
  name encodes nothing (`AppData01`), and the same name on two hosts
  (`Shared_REF`). **This is now a binding rule: no meaning is ever derived from a
  name, including "only when unambiguous."**
- **Concepts drafted** in `.docs/features/system-graph.md`: three layers (`.ps1`
  observes → human maps/tags → UX composes), three node classes
  (observed / implied / declared), two edge classes, two tag axes (`system` ×
  `stage`), and the six verbs a classification UX must support.

## Blockers

- **THE ONE THAT MATTERS — `system-graph.md` §8, and only Robert can call it.**
  `graph-interop.md` §1.1 (ratified 2026-08-07) says census must *not* be the
  dependency-graph system, because it cannot reach every node and typed names do
  not match observed ones. But roughly **a third of Robert's own example system
  is unobservable by construction** — mobile and desktop clients, third-party
  APIs — so classifying it requires declaring nodes and edges census will never
  see, plus reconciling names. That is the far side of the ratified line. Three
  readings are written out in §8; the answer decides what the UX is. **Nothing
  below the concept level should be designed until it is answered.**
- **The credential hop has still never been exercised.** No remote WinRM call
  carrying `-Credential` has run. Unchanged, and no longer `next_step` — the
  graph work is where Robert is.
- **No full real payload tree reachable here.** Fixtures remain the coverage, so
  every render branch needs a deliberate one.

## Course correction worth keeping

Mid-session Robert stopped the spec work: *"it sounds like you are trying to
implement deep down in the weeds. what i'm looking for is for you to understand
where this is all going, so that we can assemble the correct CONCEPTS."* He was
right — the first draft specified storage nesting, key types and endpoint shapes
before the node classes existed. Schema is the tractable part, so it is the part
that gets written first; an address cannot be chosen before you know what kinds
of things exist. The draft was restructured concept-first and the schema material
demoted to `system-graph.md` §11, explicitly parked.

## Parked, with reasons in the docs

- Retention thinning — Robert sets the horizon; `snapshot-aging.md` §7.
- DB ingestion — trigger: findings/estate reads exceeding ~1s at real fleet size.
- Stage-aware severity; severity tiers unratified — `census-web-v2-ux.md` §7.
- Host-app import — `.docs/host-import-manifest.md`, waiting on the host.
- A prod→dev dependency edge in the fixture (the *emergency* case beside the
  sanctioned one). Deliberately absent — it was not part of the described estate.

## Housekeeping note

`output/` is **not** in `.gitignore`; only `output/_runs/run-log.jsonl` is
tracked. Robert has copied the demo tree there and is hand-assigning stages in
`config/assets.json`. That working tree is deliberately uncommitted — worth
deciding whether the whole tree should be ignored now that it holds real work.

## Where the reasoning lives

`.docs/features/` — one file per feature, each with business rules, schema
decisions *with the why*, and an open-items section. **`system-graph.md` is the
live one.** `.docs/requirements.md` is the collector spec.
