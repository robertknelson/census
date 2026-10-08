# Stage crossings — an edge whose two ends share no stage

> Spec, 2026-10-08. Robert's wound this morning: a site he is responsible for had, for
> over a year, a configured endpoint pointing at a downstream service in the dev stage.
> "This was something that I should have seen in Atlas." Two approaches were weighed in
> conversation — a layered architecture diagram, and an audit that flags — and the
> position taken was: **the audit, computed once as a fact of the graph, surfaced
> everywhere; the diagram later, as an Atlas strategy that inherits the fact.** Rulings
> in conversation (2026-10-08): one stage vocabulary across systems *for now*; an upward
> crossing is a finding; acceptance lives in its own small file. Status: **spec, awaiting
> go.**

## 1. The wound, and why Atlas could not have shown it

Atlas has stage dots on every node and ghosts the off-stage end of an edge under a stage
filter. Neither says *wrong*:

- Until 2026-10-01 an http edge whose host was another site's host name was **unresolved**
  (census-web.md §13.1). The call was observed and never drawn to its target. For most of
  the year in question, the edge was not on the picture at all.
- Since §13 the edge resolves to the answering application, which carries its own
  associations and stage dots. But **stage lives on each endpoint's association, never on
  the edge.** Nothing computes "these two ends share no stage." A reader has to be on the
  right tab, notice a dev-coloured dot under a peer, and know what it means.
- The cross-stage bleed under a filter is deliberately neutral (system-view.md §2: "the
  point, not noise") because a *filtered* view is expected to bleed. Crossing the filter is
  presentation. Crossing stages at the endpoints is a fact. They are different things and
  both stay.

A layered diagram would have had the same gap: it depicts, it does not detect.

## 2. The rule — one comparer, server-side

For every observed or declared edge whose two ends are both staged, compare the caller's
stage set with the target's stage set:

| Ends | Reading | Direction |
|---|---|---|
| share at least one stage | **none** — fine | |
| share none; every target stage ranks **below** every caller stage | **crossing** | `down` — a higher caller reaches a lower target. The wound. |
| share none; every target stage ranks **above** | **crossing** | `up` — dev reaching prod. Sometimes intended (a shared prod reference service), sometimes a dev box writing to a prod database. |
| share none; neither of the above | **crossing** | `mixed` |
| share none; a stage on either side is not in `Census:StageOrder` | **crossing** | `unordered` — no rank to read a direction from; said as such, never guessed from the alphabet (build-found: the demo's `ref`) |
| either end unstaged | **unjudged** — said, counted, never silent | |

- **Rank** is `Census:StageOrder` (census-web.md §14). A stage the setting does not name has
  no rank here: a crossing that involves one reads `unordered` rather than borrowing the
  alphabetical placement the *lists* use.
- **The caller's stages** are the union of stages across *all* its associations, not only
  the viewed system's. An application serving two systems at prod is a prod caller.
- **The target's stages**: the union across its associations. For an **unclassified
  target whose host machine has an effective stage** (derived-machine-stage.md §2), the
  machine's effective stages stand in, and the reading is badged **derived** — it is
  derived from assertions, not from names, so it stays within the no-inference law. A
  target with neither is unjudged. (Ruled 2026-10-08: proceed on this; logged in
  `calls-made-for-you.md`.)
- **Which edges**: observed database edges to a resolved database, http edges resolved to a
  site, and attributed edges into a declared external entity that carries stages. An
  edge to an endpoint node (no answering site, unresolved) has no target to stage and is
  not judged — it is already Triage's.
- **Phantoms** (resolved-but-absent targets) are judged like any target: the claim has a
  stage on its tag or none.
- **One comparer**, `StageCrossing.Judge(callerStages, targetStages)` in
  `Services/StageCrossing.cs`, static like `StageOrder` and `HostResolver`. Every surface
  below calls it. The W-3 argument, again: one answer everywhere.

**One vocabulary across systems.** Stage names are compared as one set across all
systems, as `StageOrder` is one global list. Robert, 2026-10-08: right for the work he is
doing now; another business unit's stage names could change this. Recorded in §7 as the
flex point, not built around.

## 3. Where the fact surfaces

Every surface reads the same `StageCrossing` value; none recomputes.

### 3.1 The graph API

`SystemGraphEdgeDto` gains:

```
crossing      : null | "down" | "up" | "mixed" | "unordered"
crossingBasis : null | "asserted" | "derived"        // derived = target judged on its machine's stage
callerStages  : [...]                                 // as judged
targetStages  : [...]
unjudged      : bool                                  // one end unstaged
accepted      : null | { by, at, note }               // §4
```

`SystemGraphDto` gains `crossings` — crossing edges not accepted — and `unjudgedEdges`, for
the toolbar. Under canonical grouping a merged edge keeps the **loudest** reading of its
variants (down, up, mixed, unordered, none).

**Where it is computed.** The node and edge composition that lived in
`SystemGraphController` is now `Services/GraphComposer.cs` — one estate graph, system-free;
`EstateGraph.ForSystem` layers membership on for a view, `EdgesFor(machine, dependency)`
hands hosting and blast radius the judged edge their own observation produced. The graph
controller keeps only the view work: scope pruning, canonical collapse, the merge.

### 3.2 Atlas

- A crossing edge **draws distinctly on every tab regardless of the stage filter** — a
  warning stroke (`atl-edge-crossing`) over the verdict's own dash (verdict and crossing
  are independent axes). Fading under a filter applies as to any edge; a crossing never
  disappears into the ghost level — it floors at the bleed level. Four CSS settings on
  `.atl-svg`: `--atl-crossing-stroke`, `--atl-crossing-width`, `--atl-crossing-derived-dash`
  (the derived variant), `--atl-crossing-accepted-stroke` (the muted accepted variant). No
  arrowhead at the target end as first written: the line runs centre to centre and the
  target's shape covers it.
- **The inspector** on a crossing edge reads the fact in words:
  *MyWeb · prod → BillingSvc · dev only — crossing, down*, with the basis when derived
  (*judged on APPSRV03's stage, derived*), the source file, and the **Accept** gesture
  (§4). On an accepted edge: *accepted by robert, 2026-10-08 — "shared reference service"*
  and **Withdraw**.
- **The toolbar** carries the count in the title column as a red pill, *3 crossings*, with
  *· n unjudged* beside it when there are any. Clicking the pill lifts crossing edges and
  their endpoints to full and recedes the rest (including accepted crossings), a transient
  focus that the next press on the graph clears — not a filter state, not stored in the tab.
- **The key** gains a line under *connections*: crossing, and the derived and accepted
  variants.

### 3.3 Findings — keyed on the caller's machine

A new finding kind, **`stage-crossing`**, severity **medium** (provisional, like every
kind), one per crossing edge not accepted. It hangs on the **calling application's
machine**: the misconfiguration is a file on that machine, and that is where the fix is.
The registry-drift lesson (systems-registry.md §3) does not bite here — this finding has an
honest machine.

- Title: *Calls a lower stage: BillingSvc (dev) from MyWeb (prod)* — direction in the
  wording (*Calls a higher stage* for `up`, *Calls across stages* for `mixed`).
- Detail: the edge name and source file, the two stage sets, the target's machine and
  container, and *judged on the target machine's derived stage* when the basis is derived.
- Facets and ownership from the caller's machine, as every finding.
- Unjudged edges are **not** findings — a missing assertion is Triage's queue, not a
  defect of the estate. A count of unjudged edges is a panel figure (§3.5).

`FindingsEngine` needs the edges estate-wide; the graph controller composes them per
system. The edge composition (resolve database and http edges to their target nodes with
their associations) lifts out of `SystemGraphController` into a shared
`EdgeComposer` that both call. **Behaviour-preserving for the graph** — the fixture
counts in system-view.md §8 must hold.

### 3.4 Hosting · Dependencies, blast radius

Both already carry a per-edge verdict and detail from `HostResolver`. The crossing adds a
word to the detail — *· crossing, down (prod → dev)* — and the `Crossing` field to their
edge DTOs, so a dependent in blast radius that calls across stages says so.

### 3.5 The Atlas registry panel

Per system, beside expected-stage drift: *crossings n · unjudged edges m*. The unjudged
count is the honest remainder — how much of this system's wiring Census cannot yet judge
because an end is unstaged.

## 4. Accepted crossings — intended, said so, still drawn

Some crossings are meant. An acceptance is an assertion with provenance, like every other
human statement in Census.

**Store:** `config/stage-crossings.json`, a sibling of the tag stores, through a
`StageCrossingsStore` on the `DeclaredEntitiesStore` pattern; `Census:StageCrossingsConfigPath`
with a `.demo.json` for the demo profile.

```json
{
  "version": 1,
  "accepted": [
    {
      "caller": "[\"application\",\"PRODWEBBOX\",\"yourweb.example.com\",\"/\"]",
      "target": "[\"database\",\"PRODSQLBOX\",\"MSSQLSERVER\",\"Shared_REF\"]",
      "by": "robert",
      "at": "2026-10-08",
      "note": "Reference data has one copy per tier; ref is deliberately outside the stage order."
    }
  ]
}
```

- **Key** is the pair of node ids exactly as the graph mints them (`GraphComposer.NodeId`,
  a JSON array of parts — `["application", machine, site, path]`, `["database", machine,
  instance, name]`, `["external", name]`), so acceptance survives re-collection and follows
  the entity, not the edge instance; two config files on one caller pointing at the same
  target are one acceptance. Copy the ids from the graph API rather than typing them.
- **Semantics:** an accepted crossing is still a crossing — drawn (muted variant), named in
  the inspector as accepted, **out of the findings**, and not in the toolbar count. Never
  hidden. If the stages later change so that the ends share a stage, the acceptance is
  moot and stays on file, listed as *moot* in the registry panel so it can be removed.
- **Write path:** `GET/PUT /api/stage-crossings`, whole-file replace, the config-editor
  pattern with its known caveats. The gestures are **Accept** (a *by* field prefilled from
  the browser's `census-asserted-by`, the identity Triage uses, and a note) and **Withdraw**
  in the Atlas inspector; after either the graph is re-read and the same edge re-selected.
- **Moot acceptances** (the ends later come to share a stage) are not yet listed anywhere —
  §7.6.
- Hand-editing is first-class, as for every config file.

## 5. The layered diagram — second slice, deliberately

Robert's picture: layers top to bottom (user interface, server side / API gateway,
application, database), peers and downstream services to a side, a standard glyph per
layer (a triangle or a globe for the site, a server for the gateway, a cylinder for the
database). It fits system-view.md §2 exactly — a strategy owns layout and drawing only —
so it slots in as a third strategy without touching Atlas, and crossings are already a
substrate fact it inherits.

What it needs first, and why it is second:

- **A layer per node.** `kind` gives the database layer. An IIS application could be the
  user interface or the API gateway; telling them apart is a human assertion (a *role*
  tag or a registry fact), a new axis to triage across the estate. No inference from
  naming, so no default.
- **Detection is the problem; depiction is a second problem.** The crossing fact above
  closes the wound whether or not the picture ever exists.

Spec when he wants it: layer assignment (where it lives, who says it), the glyph set,
placement of peers, and how a crossing renders on a layered page.

## 6. Verification plan (fixtures per branch)

- **The comparer is pinned through the API** in `tests/Test-StageCrossings.ps1` (there is
  no C# test project; the repo's tests are PowerShell against a running app): shares one
  (none); prod → dev (down); dev → prod on a machine-derived stage (up, derived); val → ref
  (unordered); unstaged caller (unjudged); the canonical merge keeping the loudest reading.
- **Demo fixtures**, generated by `tests/New-DemoStageTopology.ps1` (both days of each
  machine, so the wound reads as long-standing):
  - `PRODWEBBOX myweb.example.com/` → `Services:Lookup:BaseUrl = https://yourweb.dev.example.com/api/lookup`,
    resolving through DEVWEBBOX's binding to `yourweb.dev.example.com/` (YourWeb · dev):
    **down, asserted** — his wound in miniature, a PROD site configured against a DEV site.
  - `DEVWEBBOX yourweb.dev.example.com/` → `ReportsDb` on `SQL02`, database `Gateway`:
    untagged, on a box `assets.demo.json` asserts prod — **up, derived**.
  - Already there: YourWeb's three tiers reading `Shared_REF` at `ref`, a stage outside the
    order — **unordered**; the prod one **accepted** in `config/stage-crossings.demo.json`.
  - OrderPortal's two unclassified web apps leave three edges **unjudged**.
- **API:** `/api/system-graph/{system}` edge fields and `Crossings` count;
  `/api/findings` carries `stage-crossing` on the caller's machine with the derived wording
  where applicable; the hosting and blast-radius details carry the word; §8 fixture counts
  for MyWeb and OrderPortal unchanged after the `EdgeComposer` lift.
- **Live (headless Edge):** a crossing edge visible on an unfiltered tab; still at bleed
  level under a filter that excludes its target; the inspector's words; Accept round-trip
  (finding leaves, edge mutes, file written); Withdraw; toolbar count and lift; key lines.
- **The real estate:** the wound itself — after his tags on the caller and target, the
  edge reads *crossing, down* and the finding sits on the site's machine.

> **Executed 2026-10-08** against the demo profile on a scratch server (port 5297):
> `Test-StageCrossings.ps1` **19/19**. Composer lift behaviour-preserving: MyWeb 11 members
> + 3 off-system, 9 confirmed edges before the fixture (system-view.md §8), 10 after;
> OrderPortal 2 members + 2 unclassified, external edges `declared`. Findings: four
> `stage-crossing` at medium — PRODWEBBOX *Calls a lower stage: yourweb.dev.example.com/
> (dev) from myweb.example.com/ (prod)*, DEVWEBBOX ×2 (the derived one saying *judged on
> SQL02's effective stage, derived*), VALWEBBOX. Hosting: the lookup target reads *stage
> crossing from 1 caller — down (prod → dev)*; blast radius of DEVWEBBOX carries *stage
> crossing, down (prod → dev)* on the PROD caller's edge. Overview: MyWeb 3 crossings,
> YourWeb 4, OrderPortal 3 unjudged. Accept/Withdraw round-tripped through the API (crossings
> 3 → 2 → 3, the finding left and returned, the demo file byte-identical after). Headless
> Edge (no extension in this session): the unfiltered MyWeb tab with three red crossings
> and the muted accepted one; the *MyWeb · dev* tab with the val → ref crossing floored at
> the bleed level; the inspector on the down edge (*MyWeb · prod → yourweb.dev.example.com/
> · dev — crossing, down*, Accept form prefilled *robert*); the derived edge (*… judged on
> SQL02's stage, derived*); the accepted edge with its note and Withdraw; the lift; the
> registry panel reading *3 stage crossings* / *4 stage crossings*. Clicks were exercised
> through a throwaway harness that drove the page's own methods, deleted before commit.

## 7. Open items

1. **Stage vocabulary across business units.** One global set and one `StageOrder` is
   right for his current estate (ruled 2026-10-08). If another unit's stages join, the
   comparer may need a per-system or per-unit order. Not built for; the comparer takes
   stage lists and a comparer, so the seam exists.
2. **Severity tiers** remain provisional across all finding kinds (the `SeverityRanking`
   caveat). `stage-crossing` enters at medium; `down` and `up` share it until the tiers
   are ratified.
3. **A target serving many stages on one node** (a canonical node collapsing stage
   variants, canonical-names.md §4): the crossing is judged per *variant* edge before the
   collapse, and the merged edge carries the worst reading. Confirm against the canonical
   fixture when built.
4. **Non-IIS listeners and unresolved endpoints** cannot be judged; they stay Triage's.
   When a listening-ports collector exists (census-web.md §13.5), endpoints become
   targets and join the rule.
5. **Where acceptance identity comes from** when more than one person asserts — the same
   open question every `assertedBy` carries; nothing new here.
6. **Moot acceptances.** When the stages change so the ends share one, the acceptance stays
   on file and nothing lists it. A *moot* line in the registry panel, when it earns its
   place.
7. **The caller's stage is asserted only.** An unclassified caller on a staged machine is
   unjudged, not judged on its machine (the target is). Symmetric treatment would widen
   coverage on a thinly tagged estate; held until the real estate says it is needed.
8. **The `ref` readings in the demo** make the fixture noisy (three unordered crossings per
   web property). Honest — `ref` is not in the order — and the acceptance gesture is the
   answer; placing `ref` in `Census:StageOrder` is the other (census-web.md §14's open item).
