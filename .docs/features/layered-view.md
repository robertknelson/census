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
`CleanServes` trims it and keeps it. Triage keeps the pen for classifying; the Atlas inspector
writes this one axis too (§3.1, 2026-10-09).

**The overview** (`/api/systems/overview`) adds `layersInUse` per system, for the builder
card and the panel's suggestions.

### 3.1 The layer from the inspector (2026-10-09, Robert: "node says 'tag a layer in triage'. Can we make a way to tag it here on this view, maybe in node details?")

The first real-estate use produced exactly the panel-hopping triage-workbench.md §7 named
as its revisit condition: the layered picture says *untagged*, the tag lives three clicks
away in Triage, and the picture is where the gap is seen. So the inspector carries **the
layer, and only the layer**: a `layer` row on a concrete member application of the viewed
system — the value, chips for `web`, `spa`, `api` and the system's `layersInUse`, a *by*
field (the same remembered `census-asserted-by`), Save. The write is Triage's edit for this
one axis, through the leaf-walk both now share (`estate/entity-tags-edit.mjs`): the claim on
the viewed system takes the value (emptied removes it), the entity's other claims take it
where they say nothing (§1.4), `assertedBy`/`assertedAt` land on the claim, freshest file is
the base. Then the graph is re-read and the node re-selected, so the card moves out of the
unplaced row under the reader's eye. The card itself now says *untagged — click to tag a
layer*.

Not editable here: canonical nodes (grouped; the write would fan out to every variant —
the layered strategy reads ungrouped, so the case does not arise there), service capsules,
declared entities and databases (placed by kind), and every other axis — system, stage,
canonical name stay Triage's. system-view.md §1's division of labour carries the exception.

Verified headless on the demo with one MyWeb dev site stripped of its layer: the card in
Unplaced reading *untagged — click to tag a layer*; the inspector's layer row with the three
chips, *by robert*, and the warning line; after Save, the scratch tags file carrying
`"layer": "web"` with today's provenance, the card in the Server band under a browser card,
the inspector re-selected with the *web* chip on and the warning gone.

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
- **Drag a card onto a band to tag its layer** (his 2026-10-09 "or maybe drag drop?"). The
  inspector row (§3.1) is the precise pen; the drag is the gesture. Open question before
  building: the Browser band means either `web` or `spa`, so a drop there needs a follow-up
  choice, and the layered view has no drag today (placement is pure). Build when the
  inspector row proves too slow on the real estate.

**The 2D refinement round — shelved 2026-10-09 ("let's shelve this, but we must come back
to it"), then opened the same day as §10 the management register and built ("follow your
lean, unless it is a pivotal decision. go"). What read wrong in the demo screenshots, each
now answered in §10:**

- A crossing line cuts straight across the planes between its ends: PROD → DEV runs through
  val's server row and over its labels. Routing (around planes, or along the gap) is the fix.
- A line leaves a node's centre and runs through the node's own label below it whenever the
  target is lower and to the side. Start lines at the shape's edge, or route.
- Labels cut at 22 characters; `yourweb.dev.example.com/` already loses its tail. Make the
  cut a setting, or widen the slot with it.
- Without a canonical name an application takes its own column, so a site's dev, val and
  prod variants do not line up — most of a real estate until canonical names are tagged
  (§1.5 chose this; the question is whether a stage-stripped name should stand in).
- Every plane is as wide as the union of columns, so a two-member plane shows four empty
  slots. Honest, but sparse; a per-plane compaction would break the slot rule, so any change
  is a drawing change (narrower slots, or the empty columns drawn fainter).

## 10. The management register — the shape of the refinement round (2026-10-09, Robert: "yes, write it into the spec"; "follow your lean, unless it is a pivotal decision. go" — built and verified the same day)

**The audience, in his words:** "the audience will not be so technical … I'm targeting
management with the 2D layered views … not really blocky per se, just that the nodes can
be larger, the layers can be more defined, almost like horizontal swimlanes (but not
exactly swimlanes)." The physics view is for the person who will fix the thing; the layered
view is for the person who needs the shape of a system in thirty seconds. Mermaid appeals to
that reader because it draws boxes with words in them. So: **the `layered` strategy becomes
that picture outright — no second mode, no "management" toggle.** One system, two drawings:
physics for the technical reader, layered for the rest.

Everything in this section is **drawing**. `layered-placement.mjs` is unchanged: plane, row
and slot still come from it, the slot rule (§2) still holds, and the 3D view (§8, parked)
inherits the same placement when it is un-parked. The five shelved observations above are
resolved by this register, each noted where it falls.

### 10.1 Cards, not glyphs

- A node is a **card**: a rounded block, `--atl-lay-card-w` × `--atl-lay-card-h` (settings;
  first cut 168 × 56), filled on the panel colour, a 1.5px border, the kind shown as a small
  icon at the left edge (the same database / application / external / declared shapes the
  key already has, at 12px) so the key still applies.
- **The name is words.** First line: the canonical name when the claim has one; else the
  association's system name when the node is the only member of that system on its plane;
  else the observed name. Hostname, path, and machine go to a second line in small muted
  type (`--atl-lay-card-sub`, 10px, one line, ellipsis) — never to the first line. A card
  whose first line fell back to a hostname reads as such; it is the *tag a canonical name*
  hint, not hidden. (Closes the 22-character cut: the first line is a name, and the second
  line is allowed to be cut because the inspector has the whole.)
- **The browser is a card too**, in the browser band: a browser-shaped block (a thin top bar
  with three dots, the body carrying the site's name in words) over its server card, joined
  by the stem as now; a spa's stem keeps its *calls unobserved* dash and the card says *spa*
  in the corner. To this reader "the website" is the thing.
- **Honesty marks in the same register:** a declared-not-observed card has a dashed border;
  a ghosted card (stage filter) fades the same way the glyph did; the `+n` other-systems
  badge sits in the card's top-right corner; the *unplaced* band keeps its warn badge, now
  as the card's second line: *tag a layer in Triage*.
- Slot width becomes the card width plus a gutter (`--atl-lay-slot` = card + 24); row
  height becomes the card height plus room for the stem and badges (`--atl-lay-row` =
  card + 60). Natural size and horizontal scroll stay (the call of 2026-10-08). Larger
  cards make a sparse plane read as deliberate space rather than emptiness — the empty
  columns are not drawn fainter; they are simply wider and calmer. (Closes "sparse".)

### 10.2 Bands, not row labels

- The three rows become **bands that run the full width of the picture**, behind every
  plane: Browser, Server, Data, and Unplaced when it is in use. Each band is a soft
  alternating fill (`--atl-lay-band`, `--atl-lay-band-alt`) with its name **once, on the
  left, rotated or stacked** in a label column (`--atl-lay-band-label`, 56px) outside the
  first plane — not repeated on every plane as now.
- The **stage planes become columns drawn over the bands**: a header cell at the top with
  the stage dot and name in a larger type (`--atl-lay-stage-font`, 15px), a vertical rule
  on each side running the full height, and no slab fill of their own. Downstream keeps its
  strip to the right of each plane's members, inside the same bands, separated by a thin
  dotted rule and a small *downstream* caption in the header cell.
- That is the swimlane feel without the swimlane rule: a thing may stand on two planes
  (two stages) and does; a band is a layer, not an owner.

### 10.3 Lines: fewer, heavier, routed

- **One line per pair of cards.** Several configured calls between the same two nodes (two
  connection strings to one database) collapse to one line carrying the count as a small
  pill at its midpoint (*×3*); the inspector lists them. The loudest verdict and the loudest
  crossing win the line's class, as the canonical merge already does.
- **Lines leave and enter a card's edge**, not its centre: the exit point is the midpoint of
  the card side facing the target (bottom for a lower row, right for the side strip). No
  line crosses its own card's label again. (Closes "lines through labels".)
- **A crossing is routed, not shot.** A line whose ends are on different planes leaves the
  caller's card downward into the gap under the bands (`--atl-lay-route`, 28px below the
  last band), runs horizontally along it, and rises into the target's plane — an orthogonal
  route with rounded corners, red, dashed when derived, muted when accepted, as now. It
  touches no intermediate plane. Two crossings sharing the gap stack by 8px. (Closes
  "crossing lines through intermediate planes".) Same-plane lines stay straight.
- Line weight is a setting (`--atl-lay-line`, 2px; crossings 2.5px). Arrowheads: none,
  still — direction reads from the bands (callers above callees) and from the crossing's
  colour; a management reader does not need them and they clutter.

### 10.4 What the picture does not do

- It does not invent a layer: untagged applications sit in the Unplaced band, large and
  labelled, until Triage says web / spa / api. The picture's completeness is the tagging's.
- It does not align what has no canonical name. A site's dev, val and prod cards stand in
  one column only when they share a canonical name (§1.5's rule, kept). The register makes
  the gap more visible, not less — three cards called `myweb.dev…`, `myweb.val…`,
  `myweb…` in three columns are the picture saying *tag me*. (The shelved question — should
  a stage-stripped name stand in? — stays **no**: that is inference from naming.)
- It does not hide: ghost never hide, declared dashed, every neighbour drawn.

### 10.5 Build order, when the round opens

1. Cards and the name rule (10.1) — the largest change in reading, smallest in code: the
   node template in `layered-view.mjs` and the settings in `atlas.css`.
2. Bands and the plane header (10.2).
3. Edge collapse and edge-to-edge endpoints (10.3, first two bullets).
4. Crossing routing (10.3, third bullet) — the only new geometry.
5. Headless shots of MyWeb and YourWeb at each step; `Test-LayeredPlacement.mjs` unchanged
   (placement is untouched) plus a small node test for the edge collapse and the route
   points once they are pure functions.

**Open → his "follow your lean":** the Atlas key gains two rows under *kind — shape* when
the tab is layered (the card, the browser card) and two under *layers — bands* (the ×n
pill, the routed crossing), so one key still serves every tab.

### 10.6 Built (2026-10-09)

`layered-view.mjs` rewritten as drawing only — `layered-placement.mjs` and its 17 pins are
untouched. Settings on `.atl-svg`: card 168 × 56, gutter 24, row room 60, gap 60, side 48,
pad 40, band label 56, header 40, route 28, name 18 chars, sub 30 chars, line 2, two band
fills. Cards carry the kind icon (the physics shapes at 0.55), the name rule of 10.1, the
sub line (observed name · machine, or *tag a layer in Triage* in the unplaced band), the
layer in the corner when it is not web / spa / api, and the `+n` badge at the top-right.
Bands run from the label column to the last plane; planes are a header cell plus two rules
and the dotted side split with a *downstream* caption. Lines are one `<path>` per pair of
cards from the facing edge (`port`), with a ×n pill when the pair carries several calls;
a pair on different planes is routed down, along the gap below the bands (one lane per
crossing, 28px apart) and up to the target's bottom edge. Selection matches any pair whose
`data-edges` holds the inspector's edge index.

**Verified headless on the demo:** MyWeb — dev, val, prod planes over three bands, the
browser card over each web app, MyDB and AppDB cards named by canonical name with the
observed name and machine underneath, the PROD → DEV crossing routed under the bands into
dev's downstream strip; YourWeb — the spa's browser card saying *spa · calls unobserved*,
prod's two uncanonical web apps falling back to hostnames side by side (the picture saying
*tag me*), RefData ×2 on ref, three crossings in three lanes under the bands, the derived
one dashed; the Atlas page with the key's new rows.

**The lines are pure too** (his "so how do we address the 'honest gap'?", same day):
`layered-lines.mjs` holds `pairEdges` (edges sharing two ends share a line; an undrawn end
drops the edge), `loudest` (the verdict that sorts first; an unaccepted crossing over an
accepted one), `port` (the card side facing the other end), `linePath` (straight on one
plane, routed under the bands between planes, with the pill's point) and `laneY`.
`tests/Test-LayeredLines.mjs` pins them, **16/16**, beside the placement's 17. The view only
dresses each pair in its classes. Proof the extraction changed nothing: the YourWeb
screenshot before and after is byte-identical.
