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
  off-stage or unstaged endpoint (cross-stage bleed is the point, not noise).
  Edges fade *with* their endpoints in three levels (ratified 2026-08-25 — a
  full-strength line into a receded node read as "connects to nothing"): full
  when both ends are in stage, mid when exactly one end recedes — that mid
  line IS the bleed, kept clearly present — and node-ghost level when both
  recede. Never hidden;
  unclassified neighbors show explicitly with their Triage jump; shared
  entities carry an *also serves* mark; contradicted edges render as drift;
  machines are containers, never members.

## 3. Tabs — built views

A tab = `{name, system, stages[], strategy, grouping, strategyOptions, nodePositions}`.

**Grouping is the view's choice, not the name's (ratified 2026-08-28).** A
canonical name records a fact on the association — these variants are one
thing. Whether the picture *collapses* them is a per-tab setting:
`grouping: canonical` (default, and what a missing key reads as) collapses
variants sharing a canonical name; `grouping: observed` leaves every entity
its own node, the canonical name still visible in the inspector. Sent as
`?grouping=` on the graph fetch; a toolbar chip pair flips it. Why: he built
the same system before and after naming, preferred the before, and wanted
both — naming must never make a view unreachable. Positions: canonical and
observed node ids are disjoint (`["canonical",…]` vs `["database",…]`), so one
positions map holds both layouts and the page *merges* what a settle emits
rather than replacing — shared neighbors keep their spots across a flip.
Deliberately no partial mode (collapse some names, not others).
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

**Glyphs re-imagined as common understandings (his 2026-08-25 ruling, closing
§4's Estate-consistency promise):** database = cylinder, application = globe,
external = cloud; diamond stays the neutral declared-kind (free-form kinds
can't each be honest as a pictogram), dot stays the unresolved endpoint. The
closed silhouette carries the state vocabulary (fill/dash/weight); interior
line work tints with the state but never fights the fill. The key renders
through the same shape code as the graph, so it cannot drift.

**Stage colors (ratified 2026-08-25):** stage gets its own dedicated color
channel — one colored dot per claimed stage under each node, the same colors
on the toolbar filter chips (the chip row doubles as the legend) and in the
key's stages group — so one unfiltered view shows stage structure at a
glance. Fill stays state; edge color stays verdict. Assignment is
deterministic (`stage-colors.mjs`): well-known stage names and aliases pin to
distinct slots of a color-blind-distinguishable palette (a pure hash put dev,
val and prod in one slot), unknown names hash. Nothing stored, same color
everywhere, and never color-only for meaning — the inspector keeps the words.

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
   cursor + hover, selection highlight, toolbar hint, `[hidden]` restated.
   Still reported invisible in the field the same day → the card is now
   **persistent** while a view is open, empty state until a click fills it —
   visibility no longer depends on discovering the gesture.)*
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

## 9. Grouped or every entity, chosen when the view is built (2026-10-01, Robert: "go")

The canonical/observed grouping (canonical-names.md) was a per-tab toggle only. The builder
now offers it up front — **but only where it changes the drawing**:

- `GET /api/systems/overview` carries `canonicalNameCount` (distinct canonical names claimed
  within the system) and `namedMemberCount` (members carrying one), derived per read like
  the member count.
- A system card with canonical names says so (*4 canonical names over 9 members*) and has
  two buttons, **Open grouped** and **Open every entity**. A system without any keeps the
  single click-the-card open: the two drawings would be identical.
- **Tab names say which.** Grouped keeps the plain system name (the default); every-entity
  is *System · every entity*, so two tabs of one system read apart. Flipping the toolbar
  toggle renames a tab whose name the builder gave; a name someone typed is left alone.
- The toolbar toggle stays — the choice is a starting point, not a lock.
- The builder's note no longer says views "persist in this browser": since §3's promotion
  they are saved for everyone in `config/views.json`.

**Verified 2026-10-01 in Chrome on the demo profile:** MyWeb (4 over 9) and YourWeb (2 over
3) showed both buttons; Payroll, BillingSvc, OrderPortal, Reporting one. *Open every
entity* on YourWeb opened *YourWeb · every entity* with 20 nodes; the toolbar's
*canonical* renamed it *YourWeb* and drew 19.

## 10. Starting stages, a name of your own, and a stronger focus (2026-10-01, Robert: "1 & 2 … and something else")

**The builder card is a small form.** Under each system's facts: its stages in use as
toggle chips (**start at** — none ticked means all), an optional **name** box, and the open
button(s) from §9. Ticked stages become the tab's starting stage filter — a starting point
like the grouping, changed later from the toolbar as before. The name box's placeholder
shows the name the tab will get if left empty.

**Builder-given names** are the system, then what differs from the default:
*MyWeb · every entity · prod/val*. The toolbar's stage chips and grouping toggle keep a
builder-given name in step; a typed name is never rewritten.

**Focus under a stage filter** (his ask: dim the rest more, lift the rest a little):
- Faded further — a node outside the stages and an edge with both ends outside go from
  0.22 to **0.14**; the cross-stage bleed (one end outside) from 0.45 to **0.32**, still
  clearly present, because the bleed is the point.
- What is in focus steps forward — outline 1.6 → **2.6** (canonical +1), **bold label**,
  edge 2 → **2.8** — only while something is actually faded, so an unfiltered view is
  unchanged.
- All four are CSS settings on `.atl-svg` (`--atl-ghost-opacity`, `--atl-bleed-opacity`,
  `--atl-focus-stroke`, `--atl-focus-edge`), and the key's swatches read the same ones.

**Verified 2026-10-01 in Chrome on the demo profile,** with the browser's view saves stubbed
so the live `config/views.demo.json` (in use at the time) was never written: MyWeb with
*prod* ticked showed the placeholder *MyWeb · prod*, opened as tab *MyWeb · prod* with the
prod chip active, 6 nodes in focus at a 2.6 outline and 3 faded at 0.14; the key's bleed,
ghost-edge and ghost-node swatches read 0.32 / 0.14 / 0.14.

