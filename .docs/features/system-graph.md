# The system graph — classifying what census observes

> **STATUS: concepts under discussion. Nothing here is built. No schema is decided.**
>
> The former §8 blocking question was dismissed by Robert 2026-08-17 — see §8. Concept
> work proceeds on tagging what census observes. Do not design storage until the concepts
> are settled — §11 records an earlier attempt to do exactly that, and why it was wrong.

---

## 1. What we are actually building

A UX that lets a human **map, tag and classify** what census observed, so that a graph can be
assembled from it — and from that graph, answer *what breaks if this goes down*.

Stated by Robert, 2026-08-17:

> census in what it gathers via .ps1 scripts is purely capture of existing entities. then it is
> up to ME (or someone else like me) to layer MEANING on top of what has been observed, so that
> a graph can be assembled. […] this is why i want .ps1 to observe, HITM maps/tags, and the UX
> provides the views

The goal is the **concepts** first — the nouns a human manipulates and the verbs they perform.
The storage schema is downstream of that and is deliberately not settled here.

---

## 2. The three layers

1. **`.ps1` observes.** Pure capture of entities that exist. No inference, no meaning.
2. **A human maps and tags** (HITM — human in the middle). Meaning is *asserted*, onto what was
   observed.
3. **The UX composes.** Classification workbench, perspective views, blast radius.

This is not new architecture. It is decision **W-3** (`census-web.md` §9.8 — "the collector
deliberately emits raw signals and picks no winner") applied below the machine level, and it
answers `graph-interop.md` §1.1's second objection directly. That objection said census cannot
own the graph because human-typed and observed names disagree and "there is no authority that
can settle it mechanically." Correct — so **a human settles it once, explicitly, and census
stores the answer.**

---

## 3. The binding rule: no meaning is ever derived from a name

Not stage from a `_DEV` suffix. Not system from a prefix. Not app-to-database pairing by string
similarity. Not as a fallback, not "only when it looks unambiguous."

**The wound.** In fall 2025 Robert wrote a PowerShell collector and tried to assemble the graph
programmatically from naming patterns. It worked for *most* of a real estate and then died on
the minority that did not conform. The killer was **ambiguity, not absence**: `MyDB_DEV` could
not be resolved once `MyDatabase_DEV` also existed. A rule right ninety percent of the time
produces a graph nobody can trust, because nothing tells you which ninety.

"Only when unambiguous" fails identically — ambiguity is undetectable from inside the rule.

**This rule is why the whole HITM layer exists.** It is not a constraint on the design; it is
the reason for the design.

**Enforcement.** The traps are permanent residents of `output-demo`
(`tests/New-DemoStageTopology.ps1`): `MyDB_DEV` beside `MyDatabase_DEV` (both MyWeb's, both on
DEVSQLBOX), `AppData01` encoding nothing, `Shared_REF` on two different hosts, and one logical
component named on three conventions across three stages. Code that secretly parses names
passes a clean fixture and fails the real estate. It cannot pass this one.

---

## 4. Node classes — and the arithmetic that forces them

Take Robert's own example of a large system: a GatewayAPI, an SPA, an Android app, an iOS app,
an Electron app, 15 downstream APIs (5 of them third-party), 4 databases, across 5 stages.

Census can only ever observe **IIS applications and SQL databases on Windows machines it can
reach.** Best case — everything else is IIS/SQL on domain-joined boxes — it sees the
GatewayAPI, the SPA's site, ~10 internal APIs and the 4 databases. It can **never** see the
Android app, the iOS app, the Electron app, or the 5 third-party APIs.

**Roughly a third of that system is unobservable by construction.** Not "not collected yet" —
never. So the graph is inherently mixed, and the model must carry the distinction or it will
present typed-in guesses as measurements.

| Class | Where it comes from | Example |
|---|---|---|
| **Observed** | Census saw the thing itself | `MyDB_DEV` on DEVSQLBOX |
| **Implied** | Census saw an *edge pointing at it*, never the thing | `payments.vendor.example.com` |
| **Declared** | A human says it exists; census has no evidence | the iOS app |

**Two classes of edge**, the same way:

| Class | Where it comes from | Example |
|---|---|---|
| **Observed** | Read from config | web.config connection string → `MyDB_DEV` |
| **Declared** | A human drew it | Android app → GatewayAPI |

**These must render differently.** A graph that draws "I measured this" and "someone typed
this" identically is the same untrustworthy artifact that failed in 2025, arrived at by a
different route. `graph-interop.md` §8 already says it: coverage is the confidence number.

---

## 5. Tags — two axes, no type taxonomy

Robert's Neo4j insight, which transfers: do not build a hierarchical taxonomy of node types
(HUMAN → BOY → STUDENT). Apply every label that is appropriate and query by intersection.

That model already exists here. `BaselineEvaluator.Matches` is the query engine — **AND across
keys, OR within a key, empty selector matches everything.**

Keep the *keys* rather than flattening to bare labels: flat labels cannot say which axis a
value is on, so nothing objects when `dev` and `prod` land on the same node.

| Axis | Question | Example |
|---|---|---|
| **`system`** *(decided 2026-08-17)* | *which thing* | `THE_BIG_SYSTEM`, `SUB_SYSTEM_A` |
| **`stage`** | *which copy of it* | `dev`, `val`, `prod` |

`system` × `stage` = a **deployment**. "The prod deployment of MyWeb." Other facets (`team`,
ownership) are orthogonal and unchanged.

**Nesting.** `THE_BIG_SYSTEM ⊃ SUB_SYSTEM_A` is hierarchy, and applying both tags to every
member materializes it — the standard answer, and it works. But nothing enforces it, and across
~24 components × 5 stages it is ~250 assertions where ~125 plus one declaration would do.
Declaring containment once on the tag and expanding at query time is the obvious refinement.
**Not decided** — see §9.

---

## 6. The verbs the UX must support

1. **Tag** a node — `system`, `stage`.
2. **Bulk tag** — ~120 nodes in Robert's example. Per-node clicking will not survive contact.
3. **Declare** a node census cannot see.
4. **Declare** an edge census cannot see.
5. **Reconcile** — "that *implied* endpoint is this *declared* node."
6. **Triage** — work the queue of observed-but-unclassified things.

**#6 is probably the primary screen, not the graph.** Census keeps finding things; the human
keeps classifying them; health is how small the unclassified pile is. The graph is the payoff
you look at occasionally — the workbench is what you use on Tuesday. This also matches
`graph-interop.md` §7 class 3: unmatched observations belong in a candidate queue for human
review, never a discard path.

**Views, sketched only:**

- **Matrix, not hairball.** `THE_BIG_SYSTEM` selects ~120 nodes and several hundred edges,
  which nobody can read. The landing view is systems × stages, each cell a small graph. The
  hairball exists but is never the default.
- **Blast radius inverts the relation.** Pick a node, traverse edges; tags stop being the
  filter and become the *labels on the answer* — "DEVSQLBOX down → SUB_SYSTEM_A (dev, val),
  SUB_SYSTEM_C (dev)." Three lines instead of eleven nodes.

---

## 7. What census observes today

Fact, not proposal — this is the raw material the human classifies.

| Entity | Observed identity |
|---|---|
| Machine | directory name / `computerName` |
| SQL instance | machine + `instanceName` |
| SQL database | machine + instance + `name` |
| IIS site | machine + site `name` |
| IIS application | machine + `siteName` + `path` |
| Certificate | machine + `thumbprint` |
| Dependency edge | machine + site + appPath + sourceFile + kind + name |

**Scheduled tasks are not collected.** `census-collector.md` §8.12 — specced, marked HIGH, not
built. There is no `tasks` category on the envelope. They cannot be classified until they are
collected.

---

## 8. The graph-interop boundary — RESOLVED: dismissed as moot

**Robert's ruling, 2026-08-17: "never mind the observing question, that was born out of
hypothetical."** The unobservable-third arithmetic in §4 came from a hypothetical large
system, not the estate census actually serves. The 2026-08-07 ratification stands
untouched: census tags and classifies what it observes. Declared nodes, declared edges
and reconciliation (verbs 3–5 in §6) are parked until a real estate produces a real need
— at which point this section's option list is the starting material, not a re-litigation.

The original question, kept for the record:

`graph-interop.md` §1 says, ratified 2026-08-07:

> The graph system models database servers, databases, web servers, hosted applications, and
> the dependencies between them, so that the blast radius of any one thing going down can be
> answered.

That is this document's goal, nearly word for word. §1.1 then gives two reasons census must
**not** be that system: it cannot reach every node, and human-typed names do not match observed
ones.

Verbs 3, 4 and 5 in §6 — declare a node, declare an edge, reconcile names — are census growing
hand-entered nodes and doing name reconciliation. That is the far side of the ratified line,
and §4's arithmetic says a third of Robert's own example lands there.

This must not be decided by drift. Three honest readings:

1. **Census stays observation-only.** The domain graph is the other effort; census exports
   observed nodes and edges (`graph-interop.md` §5), and that system holds the declared ones.
   No invariant is touched.
2. **Census absorbs it.** §1.1 gets rewritten, and census becomes where the whole graph lives —
   observed and declared together.
3. **Census holds the tags but not the declared nodes.** The human classifies what census sees;
   the unobservable third lives elsewhere. Census gains the `system`/`stage` axes and the
   triage workbench, and stops at the boundary.

**Nothing below the concept level should be designed until this is answered.** The answer
decides what the UX is, and everything else follows from it.

---

## 9. Decided so far

| | Decision | When |
|---|---|---|
| **G-1** | Three layers: `.ps1` observes → human maps/tags → UX composes | 2026-08-17 |
| **G-2** | No meaning is ever derived from a name — §3 — including "only when unambiguous" | 2026-08-17 |
| **G-3** | The tag key is **`system`**, not `app` or `domain`. `domain` collides with `identity.data.domain` (AD domain) in every payload | 2026-08-17 |
| **G-4** | Two axes, not one: `system` (which thing) × `stage` (which copy) | 2026-08-17 |
| **G-5** | Naming traps are permanent fixture residents so no code can quietly re-acquire a convention dependency | 2026-08-17 |
| **G-6** | The §8 boundary question is dismissed as moot — it arose from a hypothetical system, not the real estate. Census tags what it observes; declared nodes/edges parked until a real need appears | 2026-08-17 |

---

## 10. Open items

1. ~~The §8 boundary question~~ — resolved 2026-08-17, dismissed as moot (G-6).
2. **Tag nesting (`partOf`)** — declare containment once and expand at query time, or
   materialize by hand? §5. Can be added later without breaking stored assertions.
3. **Which entity kinds are classifiable** — SQL databases and IIS applications are the driving
   cases; instances, sites and machines are open.
4. **Does machine-level `stage` become derived?** Today `config/assets.json` carries
   `"DEVSQLBOX": { "stage": ["dev","val"] }`, which is the only entry in the file that states
   no actionable fact — a shrug meaning "there are dev things and val things in here
   somewhere." It exists solely because the machine was the finest thing taggable. Once its
   databases carry their own stage, the machine's could become a *rollup of seven databases*
   (true and traceable) rather than an assertion. Robert deferred this 2026-08-17 as downstream
   of the concept work.
5. **Bulk assignment UX.** Verb #2. A human classifies a real estate by hand; "tag every
   database on this instance" is probably the minimum viable gesture.
6. **Rename survival.** A tag points at an observed entity; if that entity is renamed or moved,
   the tag dangles. Surfacing it as a finding (like the existing `dangling-assertion`) is
   correct rather than a compromise — silently following a rename would be *inference*, the
   thing that burned us. If survival ever matters more, the collector could capture a durable
   SQL identifier; that is a collector change and a separate decision.

---

## 11. Deferred: schema work, parked deliberately

An earlier draft of this document (2026-08-17, same session) specified storage nesting, key
types, write flows and endpoint shapes. **Robert stopped it:**

> it sounds like you are trying to implement deep down in the weeds. what i'm looking for is for
> you to understand where this is all going, so that we can assemble the correct CONCEPTS

He was right, and the failure mode is worth naming so it does not recur: schema is the
tractable part, so it is the part that gets written first — but an address cannot be chosen
before it is known what kinds of things exist and what a human needs to say about them. §4's
three node classes, for instance, did not exist in that draft, and they change what an
identifier has to do.

Two findings from that draft are kept because they are verified against the code and will
survive whatever §8 decides — but **neither is a decision**:

- **Address by structured record, never a delimiter-joined string.**
  `BaselineEvaluator.PresentCountsByEntry` already made this exact call, stating the reason in
  the code: *"A tuple key rather than a composed string: the two sides of the lookup cannot
  drift apart on a separator."* It applies with more force here — SQL identifiers and IIS paths
  contain every candidate delimiter (`|`, `/`, `\`). The `Shared_REF`-on-two-hosts fixture case
  exists to prove a bare name is not an identity.
- **The query engine already exists.** `BaselineEvaluator.Matches`, twelve lines, is the
  intersection query §5 needs.

---

## 12. Session pickup — 2026-08-17

**Read §8, get the answer, then re-open this document.**

Built and verified this session (all on `main`, pushed through `17ffe30`):

- The three-stage fixture: DEVWEBBOX / VALWEBBOX / PRODWEBBOX / DEVSQLBOX / PRODSQLBOX, two
  snapshots each, in `output-demo`. Twelve dependency edges, all corroborating `confirmed`;
  eight land on DEVSQLBOX because it serves DEV and VAL both.
- The naming traps of §3, planted permanently.
- Generator: `tests/New-DemoStageTopology.ps1` (run under PowerShell 7 — see its header).

Robert has copied the demo tree into `output/` and begun assigning stages by hand in
`config/assets.json`. That working tree is deliberately uncommitted. **`output/` is not in
`.gitignore`** and probably should be — only `output/_runs/run-log.jsonl` is tracked today.

Not built: anything in this document.
