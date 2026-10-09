# Cross-cutting systems — a flag on the card, a fold in the picture

> Spec 2026-10-09, his item 8 of the notes round (`round-2026-10-09.md` §3), ratified "go"
> the same day and built on it. Parent docs: `systems-registry.md` (the card), `system-view.md`
> §2 (the scope rule), `canonical-names.md` §4 (the merge this reuses), `layered-view.md`
> §10 (the register the capsule draws in). Status: **built and verified 2026-10-09** (§6).

## 1. The problem, in his words

"I DO have one system (in reality) that is in fact a cross cutting concern itself. It is
AppTrak. An API and dashboard for logs: ApiRequest, Message, Exception, HealthChecks, etc.
And increasingly, each website is incorporating AppTrak into its orbit … the result is that
when I make a graph of Website A, AppTrak is in the graph, and Website B, AppTrak is in the
graph. And that is FINE, however sometimes it becomes overwhelming, especially when Website
A has DEV, VAL, UAT, PROD stages. I don't want to hard-code anything, but I must come up
with a way to deal with this."

The scope rule (system-view.md §2) is right to bring AppTrak in: an edge from a member
reaches it. The picture is wrong to draw every AppTrak endpoint as a peer of the system's
own members. The fix is not to the rule but to the drawing — and the fact that makes it
possible is a fact about AppTrak, asserted once, on its card.

## 2. The fact — `crossCutting` on the registry card

`config/systems.json`, beside description and expected stages:

```json
"AppTrak": { "description": "Logging, health, auth tokens — every site calls it", "crossCutting": true, "assertedBy": "robert", "assertedAt": "2026-10-09" }
```

- **Asserted, never inferred.** No name sniffing, no call-count threshold deciding on its
  own. The registry panel *suggests* it the way it reports drift — *called by 6 systems —
  cross-cutting?* with a *Mark* button — but the count is observed and the flag stays his.
  The overview carries `calledBy`: the number of distinct other systems with a member edge
  into this one.
- **Why not fold by count alone:** a database every system shares would fold too, and
  that is coupling you want to see, not tuck away.
- The flag is identity (what kind of system this is), so it lives on the card with the
  other identity facts, not on the associations and not in a view.

## 3. The effect — a fold, not a hide

In any system's graph other than its own, the members of a cross-cutting system fold into
**one capsule per stage set**: a node `["service", "apptrak", "prod"]` named *AppTrak*,
kind `service`, with `variants` = the folded members (the inspector lists them, as it does
for a canonical node) and a ×n for how many. The capsule is `offSystem` like the members
were; it keeps the honesty marks (declared / phantom when every member is; the `+n` other
systems badge; ghosting under a stage filter).

- **Edges re-point to the capsule and merge** by (ends, kind, verdict), the loudest crossing
  surviving — exactly the canonical merge (canonical-names.md §4; stage-crossings.md §7.3)
  with a different grouping key. A PROD site logging to AppTrak's DEV still draws red into
  the *AppTrak · dev* capsule. Acceptances are judged on the inner edge before the fold,
  so they keep working.
- **Per stage set, not per system:** AppTrak's dev, val and prod endpoints are three
  capsules. If every stage of Website A logs to AppTrak prod, four lines converge on one
  capsule, which is a fact worth seeing. A member claiming two stages folds under the key
  of both (`dev+val`).
- **Both groupings.** The fold applies under Grouped and Every entity alike; unfolding is
  the toolbar's *Services: folded | unfolded* switch, remembered on the tab, not a grouping.
- **AppTrak's own graph never folds.** It is the subject there.
- **Blast radius and findings stay flat.** The fold is a drawing concern; the audit
  surfaces (hosting, blast radius, the findings stream, the registry counts) read the
  composed estate graph, which the controller never changes.

`GET /api/system-graph/{system}?grouping=…&fold=true|false` (default true). The DTO carries
`services: [{ system, stages, members }]` whatever `fold` says, so the toolbar can show the
switch, and `folded`.

## 4. Where the capsules sit

- **Physics:** a capsule shape (a wide rounded rect, `shapeSvg('capsule')`), labelled with
  the system name and ×n, drawn as the other off-system nodes are — the layout settles it
  at the edge of the cluster because its edges come from several members.
- **Layered (the register, layered-view.md §10):** a **Services** band under Data, full
  width, one capsule card per plane in the main region (slot by system name), the sub line
  *n endpoints · stage*. Crossings into it route under the bands like any other. The band
  is listed only when a capsule is in it. Unfolded, the members stand where their own
  layer tags put them (an `api`-tagged endpoint in the server band, side strip).

## 5. Verification (fixtures)

Demo fixture: a system **Telemetry** (`config/systems.demo.json`, `crossCutting: true`),
three sites on a new box **LOGBOX** — `telemetry.dev.example.com`, `telemetry.val…`,
`telemetry.example.com` — tagged Telemetry dev / val / prod, layer `api`. Every MyWeb and
YourWeb site gets an http edge `Telemetry:BaseUrl` to the matching stage's site — except
**yourweb.val → telemetry.dev**, the crossing (down). `tests/New-DemoStageTopology.ps1`
generates it; `tests/Test-StageCrossings.ps1` pins the counts (§6).

## 6. Built and verified 2026-10-09

- `SystemRecord.CrossCutting`; `SystemOverviewDto.CrossCutting`, `.CalledBy`; the registry
  panel's badge, suggestion and checkbox.
- `SystemGraphController`: `fold`, the capsule fold after the canonical merge, `Services`
  and `Folded` on the DTO; `SystemGraphNodeDto.Service`, `.ServiceStages`.
- Atlas: `fetchSystemGraph(system, grouping, fold)`, the tab's `services` field, the
  toolbar's *Services* segment (shown when the graph has any), the key's capsule row, the
  inspector's *cross-cutting service — n endpoints folded* line; `physics-view` capsule
  shape; `layered-placement` services row (pinned); `layered-view` capsule card.
- Pins: `Test-LayeredPlacement.mjs` +2 (a service node lands in the services row, main
  region; the row is listed only when used); `Test-StageCrossings.ps1` re-pinned to the
  fixture (MyWeb 11 members, 3 + 3 capsules off-system, 13 edges, 3 crossings; YourWeb 5
  crossings; five findings) plus the fold itself: three Telemetry capsules on MyWeb with
  one variant each, `fold=false` shows the three sites and no capsule, Telemetry's own
  graph has three members and no capsule, the val → dev edge lands on the dev capsule
  reading *down*, the overview says Telemetry is cross-cutting and called by 2.
- Headless: the MyWeb · dev physics tab with two Telemetry capsules (×1 each, the capsule
  shape, LOGBOX under them), the toolbar's *Services: Folded | Unfolded* segment and the
  key's capsule row; YourWeb layered with the **Services** band — the dev and prod capsules
  under their planes and the val plane's red line routed under the bands into the dev
  capsule; MyWeb's dev plane close up, folded (the capsule card, *1 endpoint · dev*, ×1)
  and unfolded (`fold=false`: the `telemetry.dev` site drawn as itself in the server band's
  downstream strip, named *Telemetry* by the name rule); the registry panel with
  Telemetry's *cross-cutting · called by 2* badge. **Not screenshot:** the *called by n —
  cross-cutting? Mark* suggestion — no demo system is called by two others without the
  flag; the overview's `calledBy` (MyWeb 1, YourWeb 1, Telemetry 2) is pinned and the
  button calls the same persist as the card's checkbox.

## 7. Open items

- A capsule per stage set means a member on `dev+val` is its own capsule beside `dev` and
  `val`; the demo has none. If the real estate does, consider folding by the viewed
  member's stage instead (the plane the line leaves from).
- The suggestion threshold is 2 callers; a setting if it nags.
