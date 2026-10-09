# Triage workbench — slice 2 of the system graph

> Spec, 2026-08-17. Parent docs: `system-graph-principles.md` (why),
> `entity-tags.md` (slice 1 — the assertion record this workbench edits).
> Status: **ratified 2026-08-17 — all four §8 items decided as proposed
> ("Triage"; alphabetical ordering; bulk applies only filled axes, classified
> edit clears explicitly emptied ones; unknown axes preserved). Build
> authorized.**

## 1. What this slice is

The Tuesday screen (`system-graph.md` §6): census keeps finding things, the human
keeps classifying them, and health is how small the unclassified pile is. Slice 1
made assertions storable and resolvable; the only write path is hand-editing the
file. This slice gives the human a queue and a pen:

- **See the pile** — every observed-but-unclassified database and application
  across the fleet, and every dangling assertion, in one place.
- **Work the pile** — assert `system`/`stage` onto one entity or many at once,
  and clean up dangling assertions.

Out of scope: graph views and blast radius (slice 3), declared nodes/edges
(parked by G-6), machine-facet retirement (entity-tags.md §8.4, still deferred).

## 2. Placement: an Estate panel, not a page

A **Triage** chip in the Estate top bar, next to Findings, opening the standard
slide-in panel — the exact pattern Findings/Software/Hosting/Blacklist already
use. The chip carries the fleet-wide unclassified count (`Triage · 14`, or
`Triage · clear`), which makes the health metric ambient: you see the pile's
size on every visit whether or not you open the panel.

A separate page was considered and rejected: the workbench needs to open
dossiers, and everything else that does that is a panel over the canvas.

## 3. The queue

One API call (`GET /api/entity-tags/triage`) returns the whole working set,
grouped by machine → container (instance or site), in three strata:

1. **Unclassified** (the default view): observed user databases and
   applications with no assertion. System databases are excluded exactly as in
   slice 1's count.
2. **Dangling**: assertions whose address no longer resolves — shown with their
   stranded tags and a *remove* action. Same rule as the finding: never
   re-attached, only re-asserted by a human or removed. (This is
   `graph-interop.md` §7's candidate-queue duty: unmatched things get human
   review, never a discard path.)
3. **Classified** (a toggle, off by default): already-tagged entities, so a tag
   can be corrected or removed without hand-editing the file. Off by default
   because the workbench's job is the pile, not admiring finished work.

Machines whose `sql`/`iis` status is not ok appear with an explicit *unknown*
row (`collection failed — n assertions unverifiable`), not silently thinner:
same unknown-not-empty rule as everywhere else.

The queue reads latest snapshots only and is recomputed per request, like every
other read. The response also carries the distinct `system` and `stage` values
already in use — the raw material for suggestions (§5).

## 4. The gesture: select, then assert once

Bulk is the primary gesture, single-select the degenerate case
(`system-graph.md` §6: "per-node clicking will not survive contact"):

- Every queue row has a checkbox; every machine and container group header has a
  select-all for its subtree. A text filter narrows the queue; select-all then
  applies to what is visible.
- With ≥1 row selected, an assertion bar appears: `system` values, `stage`
  values, and Apply. One assertion, applied to every selected row.
- Apply merges into the loaded config (leaf per selected entity), PUTs the
  whole file through the slice-1 endpoint, and refetches the queue. Rows leave
  the pile as they are classified — visible progress.
- `assertedAt` is stamped with today's date; `assertedBy` per §6.

Editing a classified row pre-fills the bar with its current tags; Apply
overwrites the leaf (last writer wins, the ratified provenance model). Remove
deletes the leaf.

Whole-file PUT means concurrent editors are last-writer-wins, same as the
blacklist and baselines editors — a known, accepted property of every config
editor in the app.

## 5. Vocabulary: suggested, never restricted

The assertion bar offers the already-in-use `system` and `stage` values as
clickable chips, with free-text entry beside them. Clicking reuses; typing
creates. This keeps stage vocabulary free-form (entity-tags.md §8.3, ratified)
while making the typo path the *effortful* one — `pord` requires typing past a
`prod` chip that was one click away. No validation, no controlled list, no
inference.

## 6. `assertedBy`

A free-text field on the assertion bar, remembered in `localStorage` and
pre-filled on the next visit — typed once per browser, not once per assertion.
Blank is allowed (the leaf stores no `assertedBy`); the ratified §8.5 position
stands: this becomes derived when the auth model lands, and nothing here makes
that harder.

## 7. Dossier stays read-only

The dossier's chips (slice 1) remain a view; editing lives in the workbench
only. One writing surface means the bulk gesture is designed once, and the
dossier keeps its character — the full-depth *reading* of one machine. A
dossier chip row is one click from the workbench via the top bar if editing is
wanted. Revisit only if real use shows constant panel-hopping.

Revisited 2026-10-09 for one axis: real use of the layered Atlas view showed the hop (the
picture says *untagged*, the tag is in Triage), so the Atlas inspector writes the layer —
layered-view.md §3.1. The dossier stays read-only; system, stage and canonical name stay here.

## 8. Open items

1. **Panel name.** "Triage" proposed — it names the activity, matches §6's verb
   list, and stays honest about what the screen is for. Alternative: "Classify".
2. **Queue ordering.** Proposed: machines alphabetical, containers within, rows
   within — boring and predictable beats clever prioritisation until real use
   shows a need. Alternative orderings (biggest pile first) can come later.
3. **Does Apply set both axes or only the filled ones?** Proposed: only filled —
   applying `stage: dev` to twelve rows must not erase their differing `system`
   values. An explicitly emptied field on a classified row's edit *does* clear
   that axis (that is the edit gesture, §4).
4. **Unknown-axis leaves in the workbench.** A leaf can carry axes this UI does
   not render (extension data). Proposed: edits through the bar preserve them
   untouched — the store already round-trips them; the workbench just must not
   drop them when rewriting a leaf.

## 9. Verification plan — executed 2026-08-17, all green

Demo profile; fixtures are the coverage. Results (the test mutations were then
reverted so the committed fixture keeps its designed pile):

- Chip read `Triage · 21`, matching the API's fleet total. The pile: SQL01's
  four untagged PROD user databases, WEB01/WEB02/APPSRV01's applications,
  SQL02's databases.
- Unknown rows surfaced exactly: SQL01 REPORTING (`insufficient-rights`, "1
  assertion unverifiable"), ARCHIVE (`skipped`), SQL02 ETL (`timed-out`),
  APPSRV01 SQLEXPRESS — none rendered as absence.
- Dangling stratum showed DEVSQLBOX `MyDB_QA` with its stranded chips; Remove
  deleted the leaf, the `dangling-entity-tag` finding cleared (38 → 37), and
  the card left the queue.
- Bulk: group select-all on SQL01's PROD instance → assertion bar → suggestion
  chip + typed system + `Apply to 4` landed four leaves in the file with
  provenance, the chip dropped 21 → 17, and SQL01 read *clear*.
- Classified toggle + Edit: overwrote `stage` to two values on one leaf while a
  planted unknown axis (`tier`) survived untouched; the bar announced the
  clear-on-empty rule.
- Filter narrowed to the matching machine only (unknown-only machines follow
  the filter too — unknown-never-hidden governs strata, not a steered search).
