# Entity tags — slice 1 of the system graph

> Spec, 2026-08-17. Parent docs: `system-graph-principles.md` (why),
> `system-graph.md` (concepts, decisions G-1…G-6). Status: **ratified 2026-08-17
> as proposed — §8 items 1, 2, 3, 5 decided per their proposals; §8.4 deferred
> with its trigger. Built and live-verified same day; §9 records the evidence.**

## 1. Scope

The assertion record, its storage, and the derived read model — the "tags with
provenance" slice of the ratified delivery order (principles doc: tags → triage →
blast radius).

In scope:

- A place to assert `system` and `stage` onto observed SQL databases and IIS
  applications, with provenance.
- A read model that joins assertions to the latest snapshots and derives
  **rollups** for machines, instances and sites.
- Rendering: asserted tags on entity rows (dossier), derived stage/system on
  machines (Estate), visibly distinct from one another.
- A finding when an assertion points at an entity the latest snapshot no longer
  contains.

Out of scope (later slices): the triage workbench and bulk gestures, any editing
UI (see §7), declared nodes/edges (parked by G-6), blast radius.

## 2. Ratified constraints this spec is built on

- **Assertion targets are SQL databases and IIS applications only** (ratified
  2026-08-17). Machines, instances and sites never carry asserted
  `system`/`stage` — they show rollups. Meaning lives where the deployed
  artifact lives; everything above it is hosting.
- **No meaning from names** (G-2). Nothing in this slice parses an entity name,
  ever.
- **Address by structured record, never a delimiter-joined string**
  (`system-graph.md` §11). SQL and IIS names contain every candidate delimiter.
- **Two axes, multi-value** (G-3/G-4): `system` (which thing) × `stage` (which
  copy), OR-within-key like every facet in the semantic layer. Multi-value is
  load-bearing, not a generalization: the fixture's `Shared_REF` genuinely
  belongs to two systems, and DEVSQLBOX's databases are why a machine can be
  `dev` *and* `val`.
- **Tag nesting deferred** (ratified 2026-08-17): both `system` values are
  asserted by hand where containment exists; `partOf` can arrive later without
  breaking stored assertions.

## 3. Storage — `config/entity-tags.json`

A new sibling of `assets.json`, not an extension of it. Reasons:

- `assets.json` is a machine-keyed map whose values are machine facts (class
  override, ownership facets). Sub-machine assertions have a different address
  shape and carry provenance, which the facets dictionary cannot hold.
- Baselines, findings, and the canvas all parse `assets.json` today; entity
  tags should not force those readers to change.
- The file stays hand-editable — Robert is hand-assigning today and the
  workbench UI is a later slice, so hand-editing is the *primary* write path
  for now, not a stopgap.

Shape — **address by nesting, tags at the leaf**:

```json
{
  "version": 1,
  "databases": {
    "DEVSQLBOX": {
      "MSSQLSERVER": {
        "MyDB_DEV": {
          "system": ["MyWeb"],
          "stage": ["dev"],
          "assertedBy": "robert",
          "assertedAt": "2026-08-17"
        }
      }
    }
  },
  "applications": {
    "DEVWEBBOX": {
      "MyWeb": {
        "/": {
          "system": ["MyWeb"],
          "stage": ["dev"],
          "assertedBy": "robert",
          "assertedAt": "2026-08-17"
        }
      }
    }
  }
}
```

- **Databases nest machine → instance → database name.** Matches the observed
  identity (`system-graph.md` §7) level for level.
- **Applications nest machine → site name → app path.** Ditto. An app path
  (`/`, `/api`) is a single JSON key; no delimiter is ever composed or split.
- The address *is* the nesting — the structured-record rule satisfied by
  structure, which also makes hand-editing pleasant: tag five databases on one
  instance without repeating the machine five times.
- All key lookups `OrdinalIgnoreCase`, matching the rest of the semantic layer
  (and the `BaselineEvaluator.Matches` comment: the *lookup* must be
  case-insensitive because JSON round-trips drop the comparer).
- Leaf keys other than the reserved provenance fields are tag axes. Only
  `system` and `stage` are rendered in this slice; unknown keys survive
  round-trips untouched (same tolerance the facets dictionary has).

**Provenance is two fields, last writer wins.** `assertedBy` free-text (there
is no auth to derive it from — same standing gap as every write endpoint,
census-web.md open item), `assertedAt` a date. This is deliberately *not* an
audit trail; whether one is needed is an open item (§8.2). What it buys today:
every rendered tag can answer "who said so, when" — the provenance promise of
the principles doc at its minimum viable size.

## 4. Read model

`EntityTagsStore` (load/save, mirror of `AssetsStore` — whole-file read per
request, whole-file write). On top of it, joined against the latest snapshot
per machine:

- **Asserted tags** for an observed database/application: the leaf record, or
  nothing. Never inferred, never defaulted.
- **Rollups**: a machine's derived `system`/`stage` is the union of the leaf
  tags of entities observed on it in the latest snapshot. Instance and site
  rollups are the same union one level down. A rollup is always traceable to
  the leaf assertions that produced it, and the DTO carries them
  (`derivedFrom`: the contributing entities), because "true and traceable" is
  the entire point of open item 4's resolution.
- **Unclassified**: an observed database/application with no assertion. This
  slice only has to *count* them accurately per machine — the count is the seed
  of the slice-2 triage queue and the principles doc's health metric.

**Snapshot scope is latest-only.** Tags meet history in later slices if at all;
nothing here reads more than `GetLatestSnapshot`.

**Collection failures are not emptiness.** If `sql` or `iis` status is not
`ok`, the machine's rollup for that side is *unknown*, not empty — the §6.1
read-status-before-data rule that already governs `BaselineEvaluator`. A rollup
must never quietly shrink because a collector timed out.

## 5. Drift finding

When an assertion's address does not resolve in the owning machine's latest
snapshot (database dropped, app removed, either renamed):

- Emit a finding — kind `dangling-entity-tag`, severity low, alongside the
  existing `dangling-assertion` — naming the address and the tags stranded on
  it.
- **Never** silently drop the assertion, and **never** re-attach it to a
  similarly-named entity: following a rename is inference (G-2, and
  `system-graph.md` open item 6, already resolved in this direction).
- A machine with no snapshots at all keeps the existing `dangling-assertion`
  behavior; the entity-level finding needs a snapshot that positively lacks the
  entity, per §4's failure rule.

## 6. Rendering (minimum for the slice)

- **Dossier panel**: database and application rows show their asserted
  `system`/`stage` chips; untagged rows show an explicit *unclassified* mark,
  not blank space (absence is signal).
- **Estate**: machine stage badge can now come from the rollup. Derived values
  render distinctly from asserted ones — the measured/asserted visual seam of
  `system-graph.md` §4 applies from the first pixel, and a rollup chip exposes
  its `derivedFrom` on inspection.
- The existing hand-set machine `stage` facet in `assets.json` keeps rendering
  wherever it renders today until §8.4 is decided; nothing is removed in this
  slice.

## 7. Write flow

- `GET /api/entity-tags` → the file. `PUT /api/entity-tags` → whole-file
  replace, relaxed JSON escaping so the file stays hand-editable — the
  blacklist/assets pattern exactly, including its known unauthenticated-write
  caveat.
- No editing UI in this slice. Hand-editing the file is the write path; the
  workbench (slice 2) is where editing UI lands, so the bulk-gesture design
  happens once, there, instead of a throwaway per-row editor now. The PUT
  endpoint exists so the workbench has something to land on and so nothing
  outside the store ever touches the file directly.

## 8. Open items — resolved 2026-08-17 except item 4

1. **File name.** ~~Proposed~~ **Ratified**: `config/entity-tags.json`.
2. **Provenance depth.** **Ratified**: two last-writer fields. History fits the
   `PreviousValue`/`NewValue` pattern if ever wanted; nothing in the leaf shape
   blocks adding it.
3. **Stage vocabulary.** **Ratified**: free-form values, consistent with
   facets. Free-form means `pord` silently creates a fourth stage; a cheap
   later guard is a finding on stage values used exactly once, which is
   detection rather than restriction (no meaning is being inferred — a typo'd
   *tag* is human error, not a naming convention). Not built in this slice.
4. **The machine-stage facet's retirement.** **Deferred, still open.** Baseline
   `AppliesTo` selectors can match on the hand-set `stage` facet today. Does
   the derived rollup feed `Matches` (making baselines follow entity tags),
   replace the facet outright, or coexist? Not needed for this slice; needed
   before anyone deletes `"DEVSQLBOX": { "stage": ["dev","val"] }`.
5. **`assertedBy` under no auth.** **Ratified**: free-text self-report until
   the auth model (census-web.md open item) lands, at which point it should
   become derived.

## 9. Verification plan — executed 2026-08-17, all green

Fixtures are the coverage (there is no second machine and no real payload
here), so the demo tree must exercise every branch. Results against the Demo
profile:

- `config/entity-tags.demo.json` tags the five-machine topology including the
  traps: `MyDB_DEV` and `MyDatabase_DEV` tagged as distinct despite the names;
  `Shared_REF` tagged on both hosts with two systems (and stage `ref`, so the
  derived badge is visibly exercised); the three-conventions component
  (`MyDatabase_DEV`/`MyDatabase_VAL`/`AppData01`) tagged as one system.
- DEVSQLBOX rollup came back `stages: [dev, ref, val]`, `systems: [MyWeb,
  YourWeb]`, `derivedFrom` naming all seven databases — and the tile renders
  `ref` as a dashed badge beside the solid asserted `dev`/`val`, tooltip
  carrying the derivation.
- `MyDB_QA` (deliberately dangling) resolved `dangling` and produced the
  `dangling-entity-tag` finding, visible in the DEVSQLBOX dossier findings.
- `SQL01\REPORTING\ReportsMart` resolved `unknown` (instance
  `insufficient-rights`), not dangling — the absence-is-not-evidence rule.
  SQL01's unclassified count is 4 (six PROD user databases, two tagged; the
  unreachable instances excluded from the denominator).
- Dossier chips verified by screenshot on DEVSQLBOX (database rows), DEVWEBBOX
  (application rows), SQL01 (tagged + *unclassified* marks side by side;
  system databases carry no mark).
- `GET`/`PUT` round-trip is byte-stable on the demo file, and an unknown leaf
  axis (`tier`) survived a PUT/GET cycle via the extension-data passthrough.
