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
including **class** (WebServer / DatabaseServer / DevServer / DevLaptop). Ratified: class
stays observed-only — a hand-maintained class list would inherit exactly the drift problem
the census exists to kill.

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

## 5. Information architecture

- **Estate** — governance's front door. Matrix of class × stage with a group-by selector
  over any facet key. Each cell is a compliance *posture* (ok / degraded / red, with
  counts), not a number to read; drill into any cell for the machine set behind it.
  Read-only.
- **Findings** — dev-ops' front door. The unified stream of §4, facet-filterable,
  severity-ordered. The "effect compliance" surface.
- **Assignments** — the `assets.json` editor plus the unassigned queue. Same
  file-is-the-artifact pattern as the blacklist editor.
- **Working tools**, kept beneath: Machines (browse/detail/diff), Compare (upgraded to
  select by facet-group, not just observed role), Blacklist editor.
- **Absorbed from v1**: Dashboard → Estate; Certificates and Coverage views → findings
  categories (detail tables remain reachable from machine detail / drill-downs).

## 6. Ratified decisions log

| Date | Decision |
|---|---|
| 2026-07-31 | `assets.json` as webapp-owned sibling config; class stays observed-only |
| 2026-07-31 | Facet keys are multi-valued lists — stage may be dev AND qa on one machine |
| 2026-07-31 | Stage first-class in UX, open value set, schema-identical to other keys |
| 2026-07-31 | Findings have no lifecycle — raw truth, recomputed per read |
| 2026-07-31 | Estate cell posture: red = any critical finding, degraded = any finding, ok = clean |
| 2026-07-31 | Ownership dimension: operator-designated facet key + display label (`ownership` in assets.json), first-class in UX, no baked-in name |

## 7. Open items

- **Stage-aware severity** — a prod blacklist hit ≠ a dev one; an expiring bound cert in
  prod is an outage, in dev a shrug. Deferred; key=value facets keep the door open (e.g. a
  future rule field `appliesTo: { "stage": ["prod"] }`).
- Inherited from v1 spec §8: severity tiers, cert-renewal heuristic.

**Auth: out of scope, permanently** (Robert, 2026-07-31) — this UX will be incorporated
into another app that already has auth. Census Web itself never grows a login; the host
app is the boundary.
