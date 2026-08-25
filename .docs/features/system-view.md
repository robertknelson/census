# Atlas — the system view

> Spec, 2026-08-20. The read side of stage 3 (observe → classify → normalize):
> pick a system, see its dependency graph. Parent docs:
> `system-graph-principles.md` (why), `entity-associations.md` (the membership
> shape), `systems-registry.md` (identity). Status: **direction ratified in
> conversation (physics-first, tabbed strategy architecture, separate module);
> details below are proposed-and-applied under the 2026-08-20 "go", for
> ratification on return.**

## 1. A separate module, a shared truth

**Route `/atlas`** (name proposed; `/systems` is the fallback) — its own Razor
page, its own JS tree (`wwwroot/js/atlas/*`), own CSS, own controllers —
completely apart from the Estate SPA, per Robert's ask. What is deliberately
NOT separate: the stores. Atlas reads the same snapshots, tags, declared
entities and registry that Triage writes; the truth never forks. Division of
labor: **Estate/Triage keeps the pen for classifying entities; Atlas owns
system identity (the registry editor) and the views.**

## 2. One substrate, many strategies

The extensibility contract: a view strategy owns **layout and drawing only**.
Built once, shared by every strategy:

- **The graph API** — `GET /api/system-graph/{system}`, server-composed like
  blast radius. Nodes: every entity with an association to the system
  (observed databases/applications, declared tasks, external entities), plus
  **unclassified neighbors** (entities touched by an edge from a member but
  serving nothing) and **off-system endpoints** of member edges. Each node:
  kind, name, container, host machine, declared flag, resolution, its
  associations (all of them — `alsoServes` falls out), Triage-jump identity.
  Edges: observed database edges (with corroboration verdicts and source
  files), attributed external edges (verdict `declared`). All stages returned;
  stage filtering is client-side so chip toggles never refetch.
- **Shared chrome**: tab bar, the builder, stage-filter chips, legend,
  selection plumbing, the docked inspector.
- **The honesty rules live in the substrate** — every strategy inherits them:
  declared renders dashed; a stage filter **ghosts, never hides** an edge's
  off-stage or unstaged endpoint (cross-stage bleed is the point, not noise);
  unclassified neighbors show explicitly with their Triage jump; shared
  entities carry an *also serves* mark; contradicted edges render as drift;
  machines are containers, never members.

## 3. Tabs — built views

A tab = `{name, system, stages[], strategy, strategyOptions, nodePositions}`.
The "+" tab opens the builder: system picker (registry-backed: registered with
descriptions first, unregistered in-use values beneath), stage multi-select,
strategy select, name. One system per tab in this slice; multi-system tabs
deferred (filter-widening later; complicates also-serves rendering).

**Persistence — promoted to `config/views.json` (field trial proved it,
ratified 2026-08-25).** Views are estate artifacts: the tab set — id, name,
system, stage filter, strategy, node positions — lives in the operator-owned
sibling config, `GET/PUT /api/views` whole-file (the config-editor pattern
with its known concurrent-write caveat), hand-editable, unknown keys
round-trip. Positions ride the view deliberately: if the view is shared, the
arrangement that makes it readable is too. What stays personal, in
localStorage: which tab is open and whether the key card shows. One-time
adoption: a browser holding pre-promotion localStorage tabs writes them up on
first load *if the server file has no views* — after that the server file is
the truth and localStorage tabs are never read again.

## 4. Strategy v1 — physics, hand-rolled, settle-and-freeze

No libraries: spring forces on edges, pairwise repulsion, velocity damping,
SVG rendering — O(n²) is comfortable at realistic system sizes. Layout
trustworthiness inside the physics choice:

- **Seeded initial positions** from a stable hash of node identity — the same
  graph settles the same way twice; never `Math.random`.
- **Settle, then freeze**: the simulation damps to rest and stops; no
  perpetual jiggle. Drag-to-pin from day one; dragged and settled positions
  persist in the tab, so a view reopens exactly as last seen.

Node glyphs by kind (shape vocabulary consistent with Estate where it
overlaps), dashed outline for declared, stage badges from the association
being viewed, also-serves mark, unclassified styled as such. Edge styling:
solidity = provenance (observed solid, attributed/declared dashed), color =
verdict (confirmed neutral, contradicted red, unobserved muted).

**Layered** (websites / services / data, with declared asides) is the named
second strategy, parked: it arrives as one renderer class on the same
substrate. Layer assignment starts kind-derived (databases low) with an
optional asserted `tier` axis refining application placement — never names.

## 5. Selection — the docked inspector

Click a node → compact card docked in a corner (not the Estate slide-in — the
graph keeps the room): identity, host, every association with who-said-so,
its edges with verdicts, jumps to machine dossier and Triage. Click an edge →
both endpoints, source file, verdict, raw target. Click empty space →
dismissed. Unobtrusive is the requirement; the card never covers the node it
describes.

## 6. Registry editor

A panel within Atlas: the registry entries (description, expected stages,
note), the zero-member smell, the unregistered in-use values with one-click
register, and the expected-stage drift readout. Writes via
`PUT /api/systems`.

## 7. Proposed-and-applied decisions (ratify on return)

1. Module name **`/atlas`**. *(Ratified 2026-08-25.)*
2. Tabs in localStorage; `config/views.json` only on proven need. *(The field
   trial proved the need — promoted to `config/views.json`, 2026-08-25; §3.)*
3. One system per tab; multi-system deferred. *(Ratified 2026-08-25.)*
4. Physics = seeded, settle-and-freeze, drag-pin, positions per tab.
   *(Ratified 2026-08-25 as "a good start"; his field call: objects too small
   to view — node radius, labels, and spacing enlarged same day.)*
5. Inspector as docked card with the contents of §5. *(Ratified 2026-08-25;
   the field trial found it undiscoverable — nodes advertised only `grab`, and
   a CSS bug kept the empty card from ever truly hiding. Fixed: pointer
   cursor + hover, selection highlight, toolbar hint, `[hidden]` restated.)*
6. Edge/node styling vocabulary of §4. *(Ratified 2026-08-25; his ask "is
   there a key?" exposed that the §2 legend was never built — an on-screen
   key card now renders the vocabulary from the live CSS classes.)*
7. Unclassified neighbors and off-system endpoints included in the graph API
   (never-hidden applied to scope itself). *(Ratified in substance
   2026-08-25; **open** — he wants the experience smoothed, specifics owed.)*

## 8. Verification plan (fixtures per branch)

Demo registry + associations arranged so one system exercises: multi-stage
members, a shared entity (also-serves), a declared task and an external
entity as members, an unclassified neighbor via an observed edge, a
contradicted edge, a cross-stage edge (bleed ghosting under filter), an
unstaged association. Live: build a tab, filter stages, drag-pin, reopen
(positions survive), inspector on node and edge, registry edit round-trip,
register-an-unregistered gesture.

> **Executed 2026-08-20, all green** against the demo fleet. API: MyWeb graph =
> 11 members + 3 off-system YourWeb neighbors, 9 confirmed edges, stages
> dev/prod/ref/val; OrderPortal graph = the tagged Portal database + the
> external Partner Payments API as members with two *unclassified* web apps
> pulled in by their edges, external edges verdict `declared`. Browser: builder
> lists registered-first with descriptions; the MyWeb tab settles instantly and
> **identically across reloads** (seeded + persisted positions); the `dev` chip
> ghosts non-dev members while every edge keeps both endpoints visible; a real
> click opens the docked inspector (MyDB_DEV · DEVSQLBOX · MSSQLSERVER ·
> `MyWeb · dev` with provenance) without covering the graph; the registry panel
> shows MyWeb's drift (expected uat unserved; qa and ref in use unexpected),
> Payroll's zero-member smell, and Register… on the three unregistered names.
> **One §7 refinement forced by the build**: the simulation runs *synchronously*
> at mount (settle-then-freeze literally) — a frame-driven loop throttles with
> window focus and drifts for minutes, which is the jiggle the ratification
> forbids. A 4px threshold separates click from drag. The v1/v2 ux-switch is
> suppressed on /atlas (it compares the two Estate UIs; Atlas is neither).
