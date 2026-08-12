# Census Web v2 — UX Re-imagining

> Status: draft for ratification. Lives on branch `ux-reimagine`; `main` holds v1 untouched.
> Companion to `.docs/features/census-web.md` (v1 spec) — engine-level decisions there
> (blacklist model, diff keys, no-database, volatile-field rule) carry forward unchanged.
> This document covers what changes: the layer above the data.

## 1. The indictment of v1

V1 is organized by *data source* — a nav item per endpoint, everything a uniform table. It
answers "what's in the files" and makes the user translate that into their actual question.
Robert's verdict (2026-07-31): like nearly every app a developer has designed in 25 years.

The underlying data does not change. What v2 adds is a layer that organizes, maps, and
translates into how the user thinks.

## 2. The two personas

| | Dev-ops (e.g. Robert) | Governance / compliance (manager, cross-team role) |
|---|---|---|
| Thinks in | Lists, matrix comparisons, alerts | Current state of asset classes; groups as the fleet grows |
| Role | **Effect** compliance — fix things | **See** compliance — trust the numbers |
| Unit of thought | The finding, the machine | The group (class × stage × team/app/unit) |
| Posture | Works the queue, edits config | Strictly read-only |

One substrate, two projections: the same fact is a red cell to governance and a to-do item
to dev-ops.

## 3. The semantic layer — observed below, asserted above

**Observed** (from the collector, never hand-assigned): everything in the census files,
including **class** (WebServer / DatabaseServer / DevServer / DevLaptop). Class is
observed by default; a single present-as override may be asserted in assets.json with
visible provenance — see §5.3, which supersedes the original "observed-only" ruling. The
underlying observation is never destroyed, which is what keeps the drift problem (the
thing the census exists to kill) closed.

**Asserted** (from humans, never on the machine): ownership and stage. Lives in
`config/assets.json`, a third operator-owned config sibling to `machines.json` and
`blacklist.json`, editable in the UX like the blacklist (file stays the artifact,
hand-editable, pretty-printed, relaxed escaping). The UI must keep the observed/asserted
distinction visible.

### 3.1 `assets.json` schema (ratified 2026-07-31)

```json
{
  "version": 1,
  "ownership": { "key": "team", "label": "Team" },
  "assets": {
    "WEB01":    { "facets": { "stage": ["prod"], "team": ["InternalApps"], "app": ["OrderPortal"] } },
    "APPSRV01": { "facets": { "stage": ["dev", "qa"], "team": ["InternalApps"], "app": ["OrderPortal", "BillingSvc"] } }
  }
}
```

- **`ownership` designates the org-grouping dimension without baking in a name** (ratified
  2026-07-31: first-class category for business-unit/team/branch/division, but no specific
  name). The operator picks which facet key it is and what the UX calls it. That key gets
  first-class treatment — dedicated column in Findings, default group-by in Estate,
  prominent on machine detail — while staying schema-identical to every other key.
  Renaming the org structure is a config edit, not a redesign. Optional; absent means no
  key is privileged.

- **Flat key=value facets, no hierarchy** — LogExplorer's settled pattern. Teams, business
  units, and application-asset-groups are simultaneous groupings of the same machine;
  "group by" is a view-time choice over any key, not a structure.
- **Every key is multi-valued** (ratified: a machine may be dev AND qa — common on small
  teams). Single-value is a list of one; no per-key special cases.
- Keys and values are **free-string, operator-invented** (`team`, `unit`, `app`, …).
  Compared case-insensitively, displayed as typed.
- **`stage` gets first-class UX treatment** (ratified) — both personas pivot on it — but is
  schema-identical to every other key, with **no fixed value set**.

### 3.2 Covers, not partitions — a hard rendering rule

Multi-value facets mean groups **overlap**. A dev+qa machine appears in both stage columns.
Therefore no rollup may ever sum cells into a total — a governance reader adding 4 dev +
3 qa to get 7 on a 6-machine fleet is a credibility wound in exactly the audience that most
needs to trust the numbers. Totals always come from the distinct machine set; overlapping
views carry an explicit "machines may appear in more than one group" posture.

### 3.3 Assignment integrity findings

- **Unassigned** — machine present in `output/` with no `assets.json` entry. Loud, not
  neutral: same "unknown is never absent" discipline as the collector's status vocabulary.
- **Dangling assertion** — `assets.json` entry naming a machine absent from the fleet
  (rename or decommission nobody recorded).

## 4. The findings model

One unified findings stream, computed at read time from the existing engines:

| Finding | Source |
|---|---|
| Blacklist hit | BlacklistEvaluator over latest snapshots |
| Expiring/expired **bound** certificate | certificates data, expiry recomputed at render |
| Stale collection / never collected | run log × machines.json (coverage logic) |
| Pending reboot | os data |
| Unassigned machine | output/ × assets.json |
| Dangling assertion | assets.json × output/ |

Each finding carries its machine's facets, so "my team's findings, worst first" is a
filter, not a hunt.

**No lifecycle** (ratified 2026-07-31): no acknowledge / snooze / won't-fix. The stream is
raw truth, recomputed every read. Revisit only if raw truth demonstrably drowns the signal.

## 5. The experience — one surface, walked to different depths

Ratified 2026-07-31 (Robert's flow), superseding the earlier Estate/Findings two-room
sketch. Both personas walk the same narrowing path; governance just stops earlier.

### 5.1 The walk

1. **Owner selector** (1–n multi-select). Each owner carries its posture rollup — a red
   count badge computed from the findings stream — so "which owners are red" is answered
   before anything is clicked. This *is* the governance estate view. Includes an
   **Unassigned** pseudo-owner (the loud-unassigned ratification lives here).
2. **Stage multi-selector** — appears once ≥1 owner is selected, **defaults to ALL**,
   filters the canvas live.
3. **The canvas** — responding machines as selectable glyph tiles, sectioned per owner
   when multiple owners are selected (union, with per-owner section headers).
4. **Selection → action**: click = toggle select; action bar shows **[Details]** at
   exactly one selected, **[Compare]** at two-plus; double-click = dossier shortcut.
5. **Dossier / comparison** open as a **slide-in panel from the right** (~2/3 viewport)
   over the dimmed canvas — selection state preserved beneath, ESC/click-outside returns.
   The same panel pattern serves dossier, comparison, and editors: one interaction to
   learn, and embed-friendly (an overlay, not a layout contract on the host app).

The Findings stream survives as the dev-ops working queue — a panel, not a nav
destination. Machine names, owner chips, stage badges are pivots wherever they appear.

### 5.2 The glyph — three orthogonal visual channels

- **Shape/iconography = class** (distinct silhouette per class: DB, web, dev). Shape, not
  hue, because the host theme is light grays/blues and color must stay reserved. The
  header legend that teaches the shapes **is also a fleet-wide class filter** (ratified
  2026-07-31, Robert's read of the legend as clickable): with no owner selected, picking a
  class answers "show me ALL database servers regardless of team/stage"; combined with
  owner/stage selection it narrows within them. Class joins owners and stages in the URL
  hash.
- **Color = status only.** Red/amber ring = findings posture; everything else neutral. A
  red pixel always means something is wrong.
- **Badges = stage(s).** Never position — a dev+qa machine sits in one place with two
  badges (covers-not-partitions applies to geometry too).

### 5.3 Class: observed default, assertable override — REVERSES an earlier ruling

"Class stays observed-only" (§3, 2026-07-31 morning) is **superseded** (2026-07-31
evening): the reader layer may override class, stored in `assets.json` as a single
**present-as** value (`"class": "DevServer"`). Why: observed roles answer "what runs on
it"; the canvas needs "what *is* it organizationally" — and the dev box on a Server SKU
with VS + SQL Express is observationally three things, organizationally one dev machine.

The original principle survives as **provenance**: the glyph renders the override with a
visible asserted-marker; observed roles stay one hover away and are never destroyed.
Without an override, the glyph's class derives from observed roles by fixed precedence:
DatabaseServer > WebServer > DevServer > DevLaptop.

### 5.4 Retained working tools

Compare engine (drives the multi-select comparison), machine detail/diff (dossier
content), blacklist editor, assignments editor (assets.json; same file-is-the-artifact
pattern). Absorbed from v1: Dashboard → owner-selector rollups; Certificates and Coverage
→ findings categories with detail reachable from dossiers.

### 5.5 Delivery constraint

Ships as importable pieces — cshtml, `.mjs` modules, supporting `.cs` — into a host app
with a **light gray/blue theme** and its own auth and navigation. Design views as
components with theme tokens (CSS variables), not as an app with chrome. Mermaid is
available in the host; not used for the canvas (it's an interactive selection surface, not
a diagram), noted as an option for future topology sketches (e.g. app → machines).

## 6. Ratified decisions log

| Date | Decision |
|---|---|
| 2026-07-31 | `assets.json` as webapp-owned sibling config; class stays observed-only |
| 2026-07-31 | Facet keys are multi-valued lists — stage may be dev AND qa on one machine |
| 2026-07-31 | Stage first-class in UX, open value set, schema-identical to other keys |
| 2026-07-31 | Findings have no lifecycle — raw truth, recomputed per read |
| 2026-07-31 | Estate cell posture: red = any critical finding, degraded = any finding, ok = clean |
| 2026-07-31 | Ownership dimension: operator-designated facet key + display label (`ownership` in assets.json), first-class in UX, no baked-in name |
| 2026-07-31 | UX flow: owner selector (with posture rollups + Unassigned pseudo-owner) → stage multi-select (post-owner, default ALL) → glyph canvas → slide-in dossier/compare |
| 2026-07-31 | **Supersedes "class observed-only"**: single present-as class override in assets.json, provenance visible, observed roles never destroyed; derivation precedence DB > Web > DevServer > DevLaptop |
| 2026-07-31 | Glyph channels: shape = class, color = status only, badges = stage; multi-owner canvas = union with per-owner sections |
| 2026-07-31 | Slide-in panel from right (~2/3 viewport) for dossier/compare/editors; click = select, action bar [Details]/[Compare], double-click = dossier |
| 2026-07-31 | Delivered as importable components (cshtml/.mjs/.cs) into light gray/blue host; mermaid available but not used for canvas |
| 2026-07-31 | Header legend doubles as fleet-wide class filter — class-only selection sweeps all owners; combines with owner/stage scoping |
| 2026-07-31 | As-of time travel: picker offers collected dates only, default current; past view carries a loud banner and judges that day's observations under today's assignments/rules; Changes+Software disabled in the past; export honors asOf |

## 7. Open items

- ~~**Approved-baseline blessing**~~ — **spec ratified 2026-08-12**, proposed 2026-08-01 and
  parked undiscussed until then. Storage, matching rules and exemptions are all settled in
  `.docs/features/approved-baseline.md`; what it left open (missing-direction findings,
  severity tier) lives in that document's §10. Not yet built.
- **Stage-aware severity** — a prod blacklist hit ≠ a dev one; an expiring bound cert in
  prod is an outage, in dev a shrug. Deferred; key=value facets keep the door open (e.g. a
  future rule field `appliesTo: { "stage": ["prod"] }`). The `developer-edition-in-prod`
  finding covers the sharpest case meanwhile.
- **As-of calendar polish** — collected-day dots and prev/next-day arrows on the date
  input, once months of real data make them worth having.
- **First real end-to-end run** — **partly closed 2026-08-07.** Robert ran the collector
  against real IIS and reported it executed cleanly: `applications` came back populated with
  physical paths, every application `status` was `ok`, and `auth` populated with sources
  `location` and `serverDefault` — **no `webConfig`**, which is the §8.6.6 trap behaving
  exactly as predicted (`windowsAuthentication` is a locked section, so IIS Manager writes it
  into `applicationHost.config`). Reading only `web.config` would have returned empty auth for
  every application on that server.

  Still open: whether that was a remote WinRM run or a local one, and `output/` **in this
  repo** still holds only the stale 2026-07-31 `unreachable` entry. The payload is not
  reachable from the development environment (see below), so the reader remains validated
  against fabricated data only.

- **Verification constraint** (recorded 2026-08-07) — real census payloads cannot be brought
  into the development environment, and no second machine or second account is available
  here. Consequences, so they are not rediscovered: the reader is verified against
  `output-demo/` fabrications; the IIS collector is verified against a synthetic
  `applicationHost.config`; the SQL and aliases collectors *are* verified against the real
  local instance; and the credential work (collector §10) will ship structurally correct and
  entirely unexercised. Fixtures must therefore cover every render branch deliberately —
  three coverage gaps have already been caught this way (the OFFLINE badge, the runtime-spread
  badge, and the alias-join proofs), each invisible until a fixture forced it.
- **Host-app import** — execute `.docs/host-import-manifest.md` when the host is ready.
- Inherited from v1 spec §8: severity tiers, cert-renewal heuristic.

**Auth: out of scope, permanently** (Robert, 2026-07-31) — this UX will be incorporated
into another app that already has auth. Census Web itself never grows a login; the host
app is the boundary.
