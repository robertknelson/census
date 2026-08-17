# Entity tags — asserting meaning onto observed things

> **Status:** spec, open items unresolved. Nothing here is built.
> Direction ratified 2026-08-17 (three layers, §1). The schema in §4 and §5 is a proposal.

---

## 1. The three layers

Ratified 2026-08-17, and the frame everything below sits in:

1. **`.ps1` observes.** Pure capture of entities that exist. No inference, no meaning.
2. **A human maps and tags.** Meaning is *asserted* by a person, onto what was observed.
3. **The UX composes.** Graph, blast radius, and perspective views assembled from both.

This is not a new architecture. It is decision **W-3** (`census-web.md` §9.8 — "the collector
deliberately emits raw signals and picks no winner") applied one level below the machine, and
it is the answer to `graph-interop.md` §1.1's second objection. That objection said census
cannot own the graph because human-typed names and observed names disagree and "there is no
authority that can settle it mechanically." Correct — so **a human settles it once, explicitly,
and census stores the answer.** Census still never governs. It now has somewhere to keep what
the human decided, which is exactly the "candidate queue for human review, not a discard path"
of §7 class 3.

---

## 2. The binding rule: no meaning is ever derived from a name

Not stage from a `_DEV` suffix. Not application from a prefix. Not app-to-database pairing by
string similarity. Not as a fallback, not "only when it looks unambiguous."

**The wound.** In fall 2025 a PowerShell collector plus a convention-built graph got most of a
real estate right and then died on the minority that did not conform. The killer was
**ambiguity, not absence**: `MyDB_DEV` could not be resolved once `MyDatabase_DEV` also
existed. A rule that is right ninety percent of the time produces a graph nobody can trust,
because nothing tells you which ninety.

"Only when unambiguous" fails for the same reason — ambiguity is undetectable from inside the
rule. The estate is allowed to contain two databases whose names are equally plausible, and it
does.

**Enforcement.** The traps are permanent residents of `output-demo` (see
`tests/New-DemoStageTopology.ps1`): `MyDB_DEV` beside `MyDatabase_DEV`, `AppData01` encoding
nothing, `Shared_REF` on two different hosts, and one logical component named on three
conventions across three stages. Code that secretly parses names passes a clean fixture and
fails the real estate; it cannot pass this one.

---

## 3. What can be tagged

Census observes these entities today. The identity column is what the payload actually
provides — nothing derived, nothing parsed.

| Entity | Observed identity | Taggable in v1? |
|---|---|---|
| Machine | directory name / `computerName` | yes (already is) |
| SQL instance | machine + `instanceName` | open |
| SQL database | machine + instance + `name` | **yes — the driving case** |
| IIS site | machine + site `name` | open |
| IIS application | machine + `siteName` + `path` | **yes** |
| Certificate | machine + `thumbprint` | no |
| Dependency edge | machine + site + appPath + sourceFile + kind + name | no — edges are observed, never asserted |

Scheduled tasks are `census-collector.md` §8.12 — **specced, marked HIGH, not built.** There is
no `tasks` category on the envelope. They cannot be tagged until they are collected.

---

## 4. Addressing — what a tag points at

The address is the load-bearing decision. The human's tagging labour is now the valuable
artifact, and the address is the only thing preserving it across re-observation.

### 4.1 What is ruled out, and why

- **Names or conventions** — §2.
- **Intrinsic payload IDs.** SQL's `databaseId` is per-instance *and reused after a drop*, so
  it would silently re-point a tag at a different database. Actively worse than nothing.
- **A census-minted surrogate key.** Requires persistence; "No database" is an explicit
  non-goal (`census-web.md` §7).

### 4.2 Address by record, not by composed string

Use the observed identity tuple as a **structured key**, never a delimiter-joined string.

This is not a new call. `BaselineEvaluator.FleetBaselineResult.PresentCountsByEntry` is keyed
`(string BaselineId, string EntryKey)` with the reason stated in the code: *"A tuple key rather
than a composed string: the two sides of the lookup cannot drift apart on a separator."* The
same argument applies with more force here — SQL identifiers and IIS paths can contain almost
any character, so every candidate delimiter (`|`, `/`, `\`) appears in real names.

```
EntityRef = (Kind, Machine, Container, Name)

  sqlDatabase     ("sqlDatabase",    "DEVSQLBOX", "MSSQLSERVER",           "MyDB_DEV")
  iisApplication  ("iisApplication", "DEVWEBBOX", "myweb.dev.example.com", "/")
  machine         ("machine",        "DEVSQLBOX", null,                    null)
```

`Shared_REF` on DEVSQLBOX and `Shared_REF` on PRODSQLBOX differ in `Machine`, which is the
fixture case that exists to prove a bare name is not an identity.

### 4.3 Storage shape

Nested under the machine, mirroring where the entity was observed, because `assets.json` is
hand-edited and readability is a stated value (*"the UX is an editor of the operator-owned
file, not its replacement"* — `Controllers/Api/BlacklistController.cs`; `census-web.md` §4.4
makes the same call as "the file is the unit of ownership"). Names become JSON keys, so no
delimiter and no escaping problem exists in the file either.

```json
"assets": {
  "DEVSQLBOX": {
    "facets": { "team": ["StagedApps"] },
    "sql": {
      "MSSQLSERVER": {
        "databases": {
          "MyDB_DEV":       { "facets": { "stage": ["dev"], "app": ["MyWeb"] } },
          "MyDatabase_DEV": { "facets": { "stage": ["dev"], "app": ["MyWeb"] } },
          "Shared_REF":     { "facets": { "stage": ["dev", "val"], "app": ["YourWeb"] } }
        }
      }
    }
  }
}
```

The file is nested; the in-memory key is the `EntityRef` record. Those are different problems
and get different answers.

---

## 5. The tag model

### 5.1 Keys, not labels

Multi-label ("apply everything appropriate, query by intersection") is the right instinct and
is already the model: `BaselineEvaluator.Matches` is the query engine — **AND across keys, OR
within a key, empty selector matches everything.**

But keep the *keys*. Flat labels cannot say which axis a value is on, so nothing objects when
`dev` and `prod` land on the same entity. Keyed facets can.

### 5.2 Two axes, deliberately

| Axis | Question | Example |
|---|---|---|
| `app` (or `system` — open) | *which thing* | `MyWeb`, `SUB_SYSTEM_A` |
| `stage` | *which copy of it* | `dev`, `val`, `prod` |

`app` × `stage` = a **deployment**. "The prod deployment of MyWeb." Every other facet (`team`,
ownership) is orthogonal and unchanged.

### 5.3 Inheritance, and how it dissolves the DEVSQLBOX shrug

An entity's facets are its own assertions, falling back **per key** to its machine's.

`config/assets.json` currently contains:

```json
"DEVSQLBOX": { "facets": { "stage": ["dev", "val"] } }
```

Every other entry in that file states a fact. This one states a shrug — "there are dev things
and val things in here somewhere" — which nothing can act on, because the box is only half the
answer. It exists solely because the machine was the finest thing taggable.

**Proposal:** once any entity on a machine asserts `stage`, the machine's `stage` becomes
*derived* — the union of its entities' — rather than asserted. DEVSQLBOX then reports
`["dev","val"]` as a **rollup of seven databases**, which is true and traceable, instead of as
an assertion nobody can act on. Web boxes with a single stage keep asserting it directly;
nothing changes for them.

### 5.4 Containment between tags — `partOf`

`THE_BIG_SYSTEM ⊃ SUB_SYSTEM_A` is hierarchy. Materializing it (applying both tags to every
member) is the standard answer and it works — but nothing enforces it, and across ~25
components × 5 stages it is ~250 assertions where ~125 plus one declaration would do. Every new
component becomes two chances to get it wrong instead of one.

**Proposal:** declare containment once, on the tag, and expand at query time.

```json
"tags": { "SUB_SYSTEM_A": { "partOf": ["THE_BIG_SYSTEM"] } }
```

This is not a taxonomy of node *types* — the thing that made Neo4j feel hard. It is a
containment relation between tags, and it is one optional field.

---

## 6. Write flows

- **Assign** — set an entity's facets. Whole-facets replace, per the existing `PUT
  /api/assets/{machine}` shape.
- **Clear** — an entity asserting nothing is removed from the file, exactly as
  `AssetsController` already does for machines: *"An entry with nothing asserted is
  meaningless."*
- **Validate on write** — reject a facet key that is empty, and a `stage` value not in the
  known set. Do **not** validate that the entity exists: census may be tagged ahead of
  collection, and absence is reported as a finding rather than prevented (§7).

No void/audit semantics — assertions are operator-owned config, versioned by the file.

---

## 7. Dangling assertions

An `EntityRef` that resolves to nothing observed is a **finding**, never a silent drop. Same
shape as the existing `dangling-assertion` for machines, one level down.

This is correct rather than a compromise. Silently following a rename would be inference — the
thing that burned us. A renamed, dropped, or moved database is precisely an event a human
should be shown.

---

## 8. Views

Sketch only; the view slice is not specced here.

- **Matrix, not hairball.** `THE_BIG_SYSTEM` selects ~125 nodes and several hundred edges,
  which no one can read. The landing view is subsystems × stages, each cell a small graph. The
  hairball exists but is never the default.
- **Blast radius inverts the relation.** Pick a node, traverse edges; tags stop being the
  filter and become the *labels on the answer* — "DEVSQLBOX down → SUB_SYSTEM_A (dev, val),
  SUB_SYSTEM_C (dev)". Three lines instead of eleven nodes.
- **Two node classes, rendered differently.** Census observes machines, databases and IIS
  applications. Third-party endpoints exist only as the far end of an `httpEdge` — **implied by
  an edge, never collected.** They must not render as though census has seen them, or the graph
  claims knowledge it does not have (`graph-interop.md` §8: coverage is the confidence number).

---

## 9. Open items

1. **Tag key name** — `app` (exists and is populated: `OrderPortal`, `BillingSvc`,
   `SvcGateway`) or `system` (unambiguous, but collides with nothing and costs a rename).
   `app` collides in conversation with the observed `IisApplication` type; asserted vs observed
   are different layers, so it is survivable. Recommendation: `app`.
2. **`partOf` in v1, or materialize by hand first?** §5.4. It can be added later without
   breaking stored assertions.
3. **Which entity kinds are taggable in v1** — SQL databases and IIS applications are the
   driving cases. Instances and sites are open.
4. **Does machine-level `stage` become derived-only?** §5.3. Affects every existing
   `assets.json` entry, so decide before entity tagging ships.
5. **Rename survival.** If it ever matters more than the dangling finding, the collector could
   capture a durable SQL identifier. That is a collector change and a separate decision — not a
   blocker for this work.
6. **Bulk assignment UX.** A human tags a real estate by hand; per-entity clicking will not
   scale to 125 components. "Tag every database on this instance" is probably the minimum.
   Deferred to the view slice, recorded so it is not forgotten.
