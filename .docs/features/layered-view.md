# The layered view — browser, server, data; stage planes; 2D first, 3D after

> Spec, 2026-10-08. Grew out of `stage-crossings.md` §5, where it was parked as the
> second slice: his architectural diagrams of old — layers top to bottom, peers to the
> side — as an Atlas strategy. Defined in conversation the same day: three rows (browser,
> server, data), stage as the depth axis, downstream services to the side; a 3D view that
> "you could move around … look into" as the named follow-on, "a great wow factor". Status:
> **all six open items ruled "your lean" 2026-10-08; 2D built and verified the same day
> (§7); 3D (§8) is the next slice.**
>
> Parent docs: `system-view.md` §2 (one substrate, many strategies — a strategy owns layout
> and drawing only), `entity-associations.md` (the layer tag rides the system claim, as the
> canonical name does), `stage-crossings.md` (crossings are a substrate fact this view
> inherits), `system-graph-principles.md` (no meaning from a name).

## 1. Open items — rule these first

Each with the lean I would build on if told "your lean" — which he did, all six, 2026-10-08.

1. **The SPA's browser-side calls.** Census reads appsettings and web.config; a single page
   app calls its gateway from the browser, from a config file in the site folder the
   collector does not read. So a `spa` draws a browser glyph with **no line** to the API it
   calls, and the picture says so under the glyph (*calls unobserved*). Two ways to close
   it, neither built now: (a) the IIS collector reads a named config file in the site's
   physical path (`env.js`, `config.json`, `appsettings.json` under `wwwroot`) — observed,
   the honest one; (b) a declared edge on the association (`calls: ["BillingApi"]`) —
   asserted, dashed. **Lean: (a), as a later collector slice; nothing drawn until then.**
2. **A declared external entity with no stage** — which plane? **Lean: the unstaged
   plane's side strip.** Absence is signal; it does not get a stage by being external.
3. **Where the unplaced row sits.** Bottom, under data, or top, above browser. **Lean:
   bottom** — out of the picture's way, still in the picture, each node with its Triage
   jump.
4. **One `layer` per association, or per entity.** An app could be `api` for system A and
   `web` for system B only if it is two things, which it is not; but the field rides the
   claim because the canonical name does and the role is read within a system's picture.
   **Lean: on the association**, and Triage copies the value across an entity's other
   claims when they are empty, never when they are set.
5. **Canonical-name alignment for ungrouped entities.** The slot rule (§2) aligns stage
   variants by canonical name; an entity with none aligns by observed name, which differs
   per stage (`MyDB_DEV`, `MyDB`), so it will not line up front to back. **Lean: accept it
   and let the misalignment be the nudge to name canonically**; the panel already offers
   the gesture.
6. **3D as its own slice.** Spec'd here as §8 so the placement module is written to yield
   depth from the start; built after 2D is verified. **Lean: yes, that order.**

## 2. The dimensions — one placement, two drawings

The same placement serves both views. 2D lays the stage planes side by side; 3D stacks
them in depth.

| Axis | Meaning | Order |
|---|---|---|
| **y, rows** | layer | browser, server, data, then **unplaced** (§1.3) |
| **x, slots** | the entity's column within its row | by canonical name, then observed name; **the same slot on every plane** |
| **z, planes** | stage | `Census:StageOrder`, unnamed stages after, then an **unstaged** plane |
| **side strip** | downstream services and external entities | beyond the right edge of each plane, on the plane their stage puts them |

**The slot rule is the load-bearing one.** MyDB takes the same x on the dev, val and prod
planes, so the stage variants of one thing line up front to back and read as one column
through the depth. A crossing (red, inherited) is a line that leaves that lattice — which
is why it shows. A canonical name makes the alignment; without one the observed name
stands in (§1.5). Two nodes sharing a name on one plane (the same database on two servers
of one stage — `Shared_REF` on DEVSQLBOX and PRODSQLBOX in the demo) are both present, so
they stand side by side within the name's column: each node keeps one offset on every
plane it is on, and the column is only as wide as its most crowded plane (found and fixed
2026-10-09; the first cut drew them on top of each other).

**Rows and what lands in each:**

- **browser** — a glyph (his triangle) above every `web` or `spa` app, same slot, joined
  down to it by a short stem. A drawing of the tag, not an entity: nothing new to classify,
  nothing new in the graph API. Under a `spa` the stem carries *calls unobserved* (§1.1).
- **server** — apps tagged `web`, `spa` or `api`. Declared server-side kinds (a scheduled
  task serving the system) land here too; their kind is already asserted. An unfamiliar
  tag value lands here with the value as a badge — shown, never dropped.
- **data** — databases, by kind. No tag.
- **unplaced** — applications with no layer tag, each with its Triage jump. Visible.

**The side strip** holds the graph's off-system and external nodes (the ones an edge from
a member reaches): databases in the data row's height, everything else at the server
row's. The same API is `api` in its own system's picture and a peer in yours.

**Not an axis: machines.** Containers, never members (system-graph-principles.md). The
machine stays the sublabel under a node. Grouping by host is a possible later layer, §9.

**Settings, and not.** The three rows are fixed by meaning and are not a setting. Row
height, slot width, plane gap, the side strip's offset and the browser glyph's size are
CSS settings on the view (the doubtful values). Stage order is `Census:StageOrder` already.

## 3. The layer tag

**Where:** `SystemAssociation.Layer`, a nullable string beside `CanonicalName` — "within
this system, this entity is the web app". Rides the claim (§1.4). Legacy flat leaves get it
on their next write, the existing upgrade rule (entity-associations.md §3). Round-trips
through `AssociationDto.Layer` into the graph API, so every strategy sees it.

**Vocabulary, suggested never restricted** (triage-workbench.md §5):

| value | meaning | drawn as |
|---|---|---|
| `web` | a server-rendered web app | browser glyph + server node, joined |
| `spa` | a single page app; the IIS app is the static host | browser glyph + server node, joined; *calls unobserved* |
| `api` | a gateway API | server node only |

Suggestions in Triage are these three first, then any other values in use, from the
associations themselves (the canonical-name pattern). No `data` value: databases are
placed by kind, and a tag that restates an observation is the sin R2 guards against.

**Triage carries the field:** a *layer* input in the assert gesture beside canonical name;
edit overwrites, emptied removes, same as the canonical name (canonical-names.md §7.4).
`CleanServes` trims it and keeps it. Triage keeps the pen; Atlas writes no tags.

**The overview** (`/api/systems/overview`) adds `layersInUse` per system, for the builder
card and the panel's suggestions.

## 4. The 2D strategy — `layered`

A third strategy in Atlas's `STRATEGIES` beside `physics` (system-view.md §2–3), chosen
in the builder when a tab is built; `tab.strategy = 'layered'`. Observed grouping only —
the columns *are* the stage variants, so the grouping toggle reads disabled on this
strategy, with a title saying why.

**Layout:** placement is drawing, not truth, so it lives in the browser, in
`wwwroot/js/atlas/layered-placement.mjs`, a pure function from the graph DTO and the tab's
stage list to `{ planes: [{ stage, rows: { browser, server, data, unplaced }, side }], slotOf }`
— every node gets `(plane, row, slot)`; the 2D and 3D drawings consume the same result.
Planes left to right in stage order; within a plane, rows top to bottom, slots left to
right. No physics, no stored positions: the grid is the layout, so `tab.positions` is
unused by this strategy and left untouched.

**Drawing:** SVG, the shapes from `physics-view.mjs` reused for nodes (the key cannot
drift); the browser glyph is new and lives in the shared shape module so the key draws it
too. Edges are straight lines between node centres, under the nodes; same classes as the
physics view (`atl-edge-<verdict>`, `atl-edge-crossing`, the fades), so verdict, crossing,
accepted and the stage-filter ghosting render identically. The stage filter still ghosts
whole planes rather than hiding them (never hidden); the chips stay.

**Selection and the inspector:** the same `onSelect` contract — a node or an edge — so the
inspector, Accept/Withdraw and the crossings lift work unchanged.

**The key** gains the browser glyph row and a *layer* group when a layered tab is open:
browser, server, data, unplaced.

## 5. The builder

The system card offers **Strategy** as a second segment beside grouping: *Physics* |
*Layered*. Layered pre-selects *every entity*. A tab's icon carries the strategy as it
carries grouping (system-view.md §14) — a small three-bar mark.

## 6. Honesty rules kept

Every rule in system-view.md §2 holds: ghost never hide (planes and rows ghost, never
collapse), declared dashed, unclassified neighbors shown with their Triage jump (they land
in the side strip at the unstaged plane unless staged), contradicted as drift, machines as
containers. The one new honesty rule is §1.1: **no line is drawn for a call Census did not
observe**, and the picture says that it did not.

## 7. Verification plan (fixtures per branch)

- **Demo tags:** layer `web` on the three MyWeb variants and the three YourWeb variants;
  `api` on WEB01 `portal.example.com/api` (BillingSvc); one app left untagged on purpose
  (`svc.example.com/`, unclassified anyway) for the unplaced row; `spa` on one app to
  exercise the *calls unobserved* stem (lean: APPSRV01 `intranet-app/`, tagged IntranetSuite
  · dev for the purpose).
- **Placement unit check** (a node script under `tests/`, pure function): slots align by
  canonical name across planes; unstaged plane last; side strip membership; unplaced row.
- **API:** `layer` round-trips through PUT/GET entity tags; `layersInUse` on the overview.
- **Live (headless Edge):** a MyWeb layered tab — three planes dev/val/prod, MyDB in one
  column through all three, the browser glyphs over the web apps, the red crossing from the
  prod plane's MyWeb to the dev plane's YourWeb in the side strip; the dev chip ghosting the
  other planes; an edge selected; the key with the layer group; the builder's strategy
  segment.

> **Executed 2026-10-08** on the demo profile, scratch server 5297 with a scratch copy of
> the views file. `tests/Test-LayeredPlacement.mjs` (node, the pure placement) **15/15**:
> plane order and the dropped empty plane, rows by tag and kind, slot alignment by
> canonical name across planes, a two-stage entity on both planes, the side strip, the
> unstaged plane, edge endpoints on the shared plane and a crossing spanning planes.
> `Test-StageCrossings.ps1` still **19/19** after the layer tags. API: `layer` round-trips
> through PUT/GET entity tags, trimmed (`"  api  "` → `api`), and the graph reads it;
> `layersInUse` on the overview (MyWeb web; YourWeb spa, web; BillingSvc api). Headless
> Edge: the MyWeb layered tab — dev, val, prod and ref planes with the browser triangle
> over each web app, MyDB in one column through the planes, downstream strips, the red
> PROD → DEV crossing reaching from the prod plane into dev's downstream strip; the
> YourWeb tab with the spa glyph and its *calls unobserved* stem and Gateway on the
> unstaged plane's side strip; the dev chip ghosting the other planes; the inspector on the
> crossing edge; the key's browser glyph and layers group; the builder's Physics | Layered
> segment; Triage editing a claim with the *layer* row and its web / spa / api chips.
> Demo tags: `web` on the six web apps, `api` on WEB01 `portal.example.com/api`
> (BillingSvc · prod), `spa` on WEB02 `legacy.example.com/` (YourWeb · prod — not MyWeb, to
> keep system-view.md §8's 11-member count). Two build-found calls in
> `calls-made-for-you.md`: the picture draws at natural size and scrolls, and a Layout
> segment sits in the toolbar as well as the builder.

## 8. The 3D view — `layered-3d`, the named follow-on (**parked 2026-10-08**, his ruling: "hold off on the 3D view. I want to really look at the 2D view and refine it before we go 3D")

**What it is.** The same placement, drawn with the stage planes stacked in depth: dev at
the front through prod at the back, each a translucent slab with the three rows on it, the
side strip off to the right of every slab. A crossing is a red line piercing from one slab
to another. The camera orbits; *move into* dollies the camera to a plane — the stage filter
by another gesture — and the chips keep working as before.

**How, within the rules of this repo:**
- Three.js as native ES modules, **vendored** into `wwwroot/lib/three/` (`three.module.js`,
  `OrbitControls.js`, `CSS2DRenderer.js`), no build step, no CDN — the real server may not
  see the internet.
- Labels through `CSS2DRenderer` so text stays crisp and the sublabels keep their class
  names; picking by raycast into the same `onSelect` contract, so the inspector is the same
  inspector.
- Slabs translucent, or depth would hide nodes and break never-hide. Ghosting under a
  filter is opacity, as in 2D.
- The shapes: extruded versions of the 2D glyphs (a cylinder for data, a box for server, a
  flat triangle for the browser), so the key still describes both views.
- Starting camera front-right-high, isometric-ish; a *reset view* button.

**What it is for.** 2D is the working view; 3D is the showing view — the boss and the peer
leads on a screen. It is built second, after 2D is verified, because the placement module
is what makes it a drawing slice rather than a modelling one.

## 9. Later, named so they are logged

- Group by host in 3D: machines as transparent shells around their nodes on a plane.
- The SPA config collector (§1.1a).
- A per-system layer count on the registry panel beside crossings and unjudged.
