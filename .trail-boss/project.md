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
next_step: "RESTART Census.Web (the running instance predates the association/registry/atlas backend), open /atlas and build a real system's view; then the ratification pass over the proposed-and-applied items (entity-associations.md §7, systems-registry.md §5+§3 deviation, system-view.md §7) and the field trial continues"
standing: underway          # underway|parked|blocked|review — where it sits across the range (docs/STANDING.md)

# ── synthesis ──
themes: []
relates: []
---

## notes

### 2026-08-20 (second session — the association arc + Atlas)
- **The Triage attribute gesture was field-broken and got redesigned live**: every
  unresolved-endpoint row carried its own input (fill one, click another's button
  → empty refusal) and refusals rendered off-screen at the top. Now one row at a
  time, focused input, Enter saves, refusals inline at the row (`2114599`).
- **Robert stated the end goal** (observe daily w/ deltas → classify observed+
  unobserved → normalize as system-entity/stage) and drove three rulings:
  **R1** normalization = derived join + thin identity registry (never
  membership); **R2 (G-7)** the association shape `serves: [{system, stages[]}]`
  — stages belong to the system claim (his MyFancyDB dev+val / Other val case;
  the flat axes' cross-product could not say it); **R3** Triage's bar is the
  association-assignment surface. He also chose **physics-first with a
  strategy/tab architecture** for the system view and a **separate module**
  ("completely separate from observation/triage/estate") — named `/atlas`.
- **Built under his loaded "go" (he left mid-session), one commit per verified
  slice**: G-7 associations (read-both forever, upgrade-on-write, per-claim
  provenance, chip-per-claim Triage bar, stage-only-apply guard; APPSRV01 blast
  answers 2 lines not the cross-product's 4; DEVSQLBOX legacy leaves byte-
  identical); systems registry (`systems.json`, overview with member counts +
  expected-stage drift; drift surfaces in the Atlas panel NOT the machine-keyed
  findings stream — build-discovered deviation to ratify); Atlas at `/atlas`
  (own JS tree, `GET /api/system-graph/{system}`, tabbed built views in
  localStorage, hand-rolled physics that settles synchronously and freezes,
  seeded + persisted positions, ghost-never-hide stage chips, docked inspector,
  registry editor).
- **Awaiting his ratification pass** (all applied as proposed, flagged in each
  spec): entity-associations §7 (per-association provenance; stage-only rule;
  upgrade-whole-leaf), systems-registry §5 + the §3 drift-placement deviation,
  system-view §7 (atlas name, localStorage tabs, one-system tabs, sync-settle,
  inspector contents, edge/node styling, neighbor scope).
- **His running instance (pid 10900) predates all three slices** — restart
  required before any of this is visible to him. His live tree was never
  touched; all verification ran on a second instance against the demo profile,
  every mutation reverted.
- `main` at `7957180`, all pushed.

### 2026-08-20
- **G-6's trigger fired and the parked item shipped the same day.** Robert
  brought two real needs from his field trial: Task Scheduler jobs he ruled
  will never enter the collector, and external near-peer APIs common in large
  orgs. He explicitly invited counter-argument on the external case ("if not,
  convince me of why") — conceded instead: the edge is already *observed*
  (connection strings, endpoint URLs), so an unattributable target is exactly
  the unexplained pile the health principle forbids. Reading #2 of §8, per
  G-6's own terms. Invariant held: asserted never impersonates observed.
- **Spec written and ratified in one pass** (`declared-entities.md`, all seven
  open items as proposed): `config/declared-entities.json` sibling file (his
  open/closed requirement — zero existing schema touched), free-form kinds,
  external blast subject in-arc, verbatim http targets, A/B slicing, untagged
  declaration allowed, loose-port rule.
- **Slice A** (`d4dba3c`): machine-anchored entities — store, GET/PUT, declared
  rows in Triage (declare form with duplicate guard, classify/edit/remove),
  rollup contribution with resolution `declared`, dashed seam everywhere,
  dossier "Declared on this machine", blast radius hosted contributor,
  `dangling-declared-entity` finding. Verification exposed a real pre-existing
  gap: canvas universe omitted machines named only by assertions, so their
  findings never rendered — fixed, OLDBATCH01 now a ghost tile.
- **Slice B** (`59a70ee`): `ExternalAttribution` — exact-match join, estate
  machines always win, 80/443 normalize, portless-matches-any; Triage external
  card (0-match smell, shadows-SQL01 warning live in the fixture) and
  unresolved-endpoints stratum with the attribute gesture (append identifier =
  reconcile, verb 5 made mechanical); `GET /api/blast-radius/external/{name}`
  — "the partner API dies → OrderPortal prod via WEB01" answered on screen,
  every edge badged *declared target*, never a verdict. Chip now carries the
  fleet-level pile (29 = 22 + 1 untagged external + 6 unresolved).
- Also: baselines primer committed; Baselines-tab positions given (per-type =
  `class` selector already ratified; gap is a bless-from-tab entry point +
  scope-grouped list) — **ratified with "go" and built same session**: the
  panel now groups its list by scope shape (fleet-wide / by class / by facet /
  single machine, derived from `appliesTo`, never stored) and carries "Bless a
  new baseline…" — source-machine picker seeds scope and suggested id from the
  machine's class/stages; bless-refusal for a failed collection surfaces in
  the panel (verified live against BUILDSRV01); materialize-by-value held, no
  create-empty path. approved-baseline.md §9 amended + decision logged.
- **Observation flagged, then fixed on his "fix it"**: any baselines-panel
  write was serializing absent `required` as explicit `"required": false`,
  eroding the §12 fixture branch that deliberately omits the key.
  `JsonIgnore(WhenWritingDefault)` on `Baseline.Required`; verified: whole-file
  PUT round-trips byte-identical to the committed fixture, un-requiring an
  entry drops the key entirely, `required: true` survives.
- `main` at `59a70ee` + the baselines-tab commit, all pushed. Demo fixtures
  restored to designed state after every live mutation.

### 2026-08-17 (second session)
- **The whole system-graph arc shipped in one session**: three slices, each
  spec → open items ratified → built → live-verified in the browser → committed.
  Robert dismissed the §8 boundary question as born of a hypothetical — census
  tags what it observes, the Aug 7 ruling stands untouched (G-6).
- **Slice 1 — entity tags** (`entity-tags.md`): `config/entity-tags.json`,
  address-by-nesting (machine→instance→db / machine→site→path), multi-value
  `system`×`stage` leaves with provenance; resolution observed/dangling/unknown
  (absence only counts when category *and* instance report ok); machine rollups
  with `derivedFrom`; dashed derived badges on tiles; `dangling-entity-tag`
  finding; GET/PUT round-trip byte-stable, unknown axes survive.
- **Slice 2 — Triage workbench** (`triage-workbench.md`): top-bar chip with the
  fleet unclassified count, queue grouped machine→container in three strata
  (unclassified / dangling / classified toggle), unknown scopes as explicit
  rows, bulk select-and-assert with suggestion chips, edit-overwrites vs
  bulk-merges semantics. Verified end-to-end: pile 21→17, dangling removal
  cleared its finding live.
- **Slice 3 — blast radius** (`blast-radius.md`): `GET /api/blast-radius/{m}` —
  hosted entities + dependent apps via observed edges, composed into
  system×stage deployment lines with per-edge verdicts; unclassified and
  unknown stated, contradicted edges their own stratum. `HostResolver`
  extracted from HostingController, `/api/hosting` verified byte-identical.
  DEVSQLBOX answers `MyWeb (dev,val), YourWeb (dev,val)` — the fixture's
  raison d'être, on screen.
- Also: principles memorialized in `system-graph-principles.md` (Robert
  ratified the fresh re-derivation), `output/` gitignored (run-log untracked),
  his hand-edited assets.json stage facets committed with his blessing.
- **Field-trial protocol written at his request** (`.docs/field-trial-real-estate.md`):
  staged walk collection→render→edges→tagging→blast radius, each section ending in
  a Report-back list — he executes against real infrastructure and responds with
  the package. Includes the first-ever live WinRM run, watched by hand.
- `main` at `5161026`, all pushed.

### 2026-08-17
- **New direction, and it is the big one: the system graph.** Classify observed
  entities into composite applications ("select a tag, get a domain"), then
  explore the graph and answer blast radius. Concepts drafted in
  `.docs/features/system-graph.md`. **Blocked on §8** — a third of Robert's own
  example system (mobile clients, third-party APIs) is unobservable by
  construction, so classifying it means declaring nodes census can never see,
  which is the far side of `graph-interop.md` §1.1. Only he can call it. That is
  `next_step`.
- **A scar surfaced and is now a binding rule.** Fall 2025: he built a graph from
  naming conventions; it worked for most of a real estate and died on the rest —
  ambiguity, not absence (`MyDB_DEV` unresolvable once `MyDatabase_DEV` existed).
  **No meaning is ever derived from a name**, including "only when unambiguous."
  This is *why* the human-in-the-middle layer exists.
- **Fixture: three-stage WebApp→DB topology** (5 machines, 12 edges, all
  `confirmed`), with 8 edges landing on DEVSQLBOX because it serves DEV and VAL
  both. Naming traps planted permanently so no code can quietly re-acquire a
  convention dependency. `tests/New-DemoStageTopology.ps1`.
- **csproj flipped to Robert's standard**: `Nullable=disable` +
  `ImplicitUsings=disable`, 292 annotations and 30 `!` operators removed,
  verified by all 20 read endpoints being byte-identical before and after.
  Resolves the `census-web.md` §8 open item ahead of absorption — his call.
- Mid-session course correction, kept in the dispatch: he stopped the spec work
  for going to schema before concepts. The doc was restructured concept-first.
- `main` at `46d2f80` + this write-up.

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
