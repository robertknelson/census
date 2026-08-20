# Declared entities — the graph past the edge of observation

> Spec, 2026-08-20. Parent docs: `system-graph-principles.md` (why),
> `system-graph.md` (concepts; this reopens the G-6 parking per its own terms),
> `entity-tags.md` / `triage-workbench.md` / `blast-radius.md` (the slices this
> extends). Status: **ratified 2026-08-20 — all seven
> §10 items decided as proposed (file name; free-form kind; external subject in
> this arc; verbatim http targets; A/B slicing; untagged declaration; loose-port
> rule). Build authorized.**

## 1. The trigger, and what is being decided

G-6 parked declared nodes and edges "until a real estate produces a real need — at
which point §8's option list is the starting material, not a re-litigation." The
2026-08 field trial produced two:

1. **Scheduled tasks.** Windows Task Scheduler jobs are part of real systems.
   Ruled (2026-08-20): they will **not** be added to the collector — they enter as
   assertions.
2. **External endpoints.** Apps carry configured endpoints that call near-peer APIs
   outside the census'd machines — common in any large organization. The edge is
   already **observed** (connection string, endpoint URL, on an observed machine);
   only the target is off-graph. By the health principle — everything found is
   either explained or *known*-unexplained — an observed edge pointing at nothing
   is unexplained residue that only an entity can absorb.

This is reading #2 from `system-graph.md` §8: census holds observed and declared
together. The invariant survives intact, because it was never "census stores only
observations" — `assets.json`, tags, and baselines are all assertions. The line is:

**Asserted must never impersonate observed.** A declared entity carries provenance
and renders as declared everywhere, participates in no observed count, and is never
corroborated — census cannot verify a thing it does not collect, and the model says
so rather than pretending.

## 2. Vocabulary

- A **declared entity** is an entity a human asserts exists, with provenance. Two
  anchor shapes:
  - **Machine-anchored**: lives on an observed machine (a scheduled task on
    APPSRV01). The machine is observed; the entity is not.
  - **External**: anchored to nothing census observes (a partner API). It stands
    on its declaration alone and earns its edges by attribution (§4).
- An **endpoint identifier** is a target address a human asserts belongs to an
  external entity (`https://api.partner.com`, `partnersql:1433`).
- An **unresolved endpoint** is an observed edge whose target resolves to no estate
  machine and matches no declared identifier — the triage-visible gap.
- **Attribution** is the mechanical exact-match join between observed edge targets
  and declared identifiers. (This is `system-graph.md` §6 verb 5 — *reconcile* —
  made concrete: the human gesture is declaring the identifier; the join is then
  mechanical.)

## 3. Storage — `config/declared-entities.json`, a new sibling file

**The existing schemas do not change — open/closed holds at the file level:**

| Artifact | Change |
|---|---|
| Collector envelope | **None.** Declared entities are assertion-layer by definition; the collector never learns they exist. |
| `config/entity-tags.json` | **None.** Its contract is assertions *onto observed things* — every address must resolve against a snapshot or dangle. Declared entities never resolve against snapshots; mixing two resolution semantics in one file invites readers to blur them. Same argument that made entity-tags a sibling of assets rather than an extension (entity-tags.md §3). |
| `assets.json`, `baselines.json`, `blacklist.json`, `machines.json` | **None.** |
| API | Additive only: new endpoints for the file; existing responses (triage, blast radius) gain new properties/strata. No existing property changes shape. |

Proposed shape — the entity-tags conventions carried over (address by nesting,
tags at the leaf, `OrdinalIgnoreCase` lookups, unknown axes round-trip via
extension data, relaxed escaping, hand-editable):

```json
{
  "version": 1,
  "onMachines": {
    "APPSRV01": {
      "Nightly ETL sweep": {
        "kind": "scheduled-task",
        "system": ["MyWeb"],
        "stage": ["prod"],
        "note": "Task Scheduler; runs Import-Feeds.ps1 02:00",
        "assertedBy": "robert",
        "assertedAt": "2026-08-20"
      }
    }
  },
  "external": {
    "Partner Payments API": {
      "kind": "api",
      "endpoints": ["https://api.partner.example.com"],
      "system": ["MyWeb"],
      "stage": ["prod"],
      "assertedBy": "robert",
      "assertedAt": "2026-08-20"
    }
  }
}
```

- The record **is** the assertion, so provenance sits on the record, not on a
  separate tag leaf. Same two-field last-writer model as entity tags (§3),
  upgradeable to history later without reshaping.
- `kind` is free-form with UI suggestions (`scheduled-task`, `api`, `service`),
  consistent with the free-form stage ruling (entity-tags.md §8.3): suggestion
  chips make the typo path the effortful one; no controlled list, no inference.
- `system`/`stage` are the same multi-value axes as everywhere. A declared entity
  *may* be declared untagged — it then sits in the unclassified pile like any
  observed entity (§6). Declaring and classifying are separable gestures.
- `endpoints` appears only on external entities. Machine-anchored entities have no
  identifiers to match — their address is the anchor.

## 4. Attribution — exact match against a human assertion, nothing softer

An observed edge attributes to an external entity when its normalized target
matches a declared identifier **exactly**, case-insensitively:

- **Database edges**: host, or host + port when the identifier carries one. These
  edges first run through `HostResolver` as today; **an estate machine always wins**
  — only edges resolving to *no* machine are candidates for attribution. A declared
  identifier that also names an estate machine changes nothing downstream and is
  surfaced as a config smell in the panel ("shadows machine WEB01"), the
  found-on-0-of-N pattern (approved-baseline.md §7.0): a mistake surfaced next to
  where it was made, never a finding.
- **HTTP edges**: scheme + host + port. Path is app-internal routing and does not
  participate.

**Why exact match is not the 2025 scar.** The scar is deriving meaning from names
nobody asserted. Here a human asserts the meaning of the identifier once,
explicitly — matching against it is the blacklist's displayName pattern, not
convention-sniffing. Accordingly there is **no substring match, no wildcard, no
"close enough", no DNS resolution, and no auto-creation** of entities from
unresolved endpoints. Variety is handled by listing more identifiers, each one a
deliberate assertion. An unresolved endpoint stays loudly in triage until a human
attributes it; a declared identifier matching zero observed edges reads as
"matched by 0 edges" in the panel — config smell, not finding.

## 5. Read model and drift

- **Declared entities never dangle** — nothing observed backs them, by
  construction. What *can* drift:
  - A machine-anchored entity whose anchor machine leaves the estate (dropped from
    `machines.json` / no snapshots): finding `dangling-declared-entity`, low, the
    `dangling-entity-tag` pattern — never silently dropped, never re-anchored.
  - An external entity's identifier matching zero edges: panel smell, per §4.
- **Rollups**: a machine-anchored entity's tags join the machine rollup exactly as
  observed entities' tags do, and `derivedFrom` names it — marked declared, so a
  rollup chip can show that a stage came from an assertion about an asserted thing.
- **Never corroborated, and stated.** No verdict, no freshness, no presence check.
  Where observed entities show collection status, declared ones show their
  provenance line. That is the honest trade of not collecting them.

## 6. Triage

Declared entities are classified in the same workbench, plus one new stratum:

- **Untagged declared entities** join the *unclassified* stratum (marked declared).
  The assertion bar works on them unchanged — same axes, same suggestions, same
  bulk gesture; writes land in `declared-entities.json` instead of
  `entity-tags.json`.
- **New stratum: unresolved endpoints.** Observed edges resolving to no machine and
  attributed to no entity, grouped by normalized target (one row per target, its
  source edges behind it). Row gesture: *attribute to…* — pick an existing external
  entity or declare a new one; either way the gesture **appends the identifier to
  the entity record**, and the mechanical join does the rest. HTTP edge targets are
  listed **verbatim** here — this does not reopen the §11.7 alias-matching
  deferral, which was about matching URL hosts against estate machine bindings
  (inference risk); listing a raw observed target for human attribution infers
  nothing.
- **Declare gesture** lives in the Triage panel (+ *Declare entity…*): name, kind,
  anchor (machine picker or external), tags, note. Triage is where the pile is
  worked; a declared entity is the human explaining a gap, which is triage's verb.

The pile count stays honest: unresolved endpoints and untagged declared entities
both count toward the chip.

## 7. Blast radius

- **Machine subject** (existing): machine-anchored declared entities join the
  hosted contributors — they go down with the box — contributing their
  system × stage cross-product, rendered declared. Zero new composition logic.
- **New subject: external entity** — *"the partner API dies → what breaks?"* The
  outage you don't control and most need to enumerate. Dependents are applications
  whose observed edges attribute to the entity's identifiers; composed into
  deployments exactly as the machine answer, each line carrying both halves of the
  provenance: *edge observed on WEB01 (`appsettings.json`), target declared by
  robert*. Untagged dependents land in the unclassified bucket; there is no hosted
  section (nothing census observes is *on* an external entity).
- Entry: the Triage/panel row for an external entity offers *Blast radius*, beside
  the machine gesture. `GET /api/blast-radius/external/{name}`.

## 8. Rendering

- The measured/asserted visual seam (`system-graph.md` §4) extends to entities:
  declared entities render dashed/badged **declared** everywhere they appear —
  dossier, triage, blast radius contributors, rollup derivations.
- The machine dossier gains a **Declared on this machine** section — never
  interleaved with observed inventory, never counted in observed counts.
- External entities have no glyph on the canvas in this arc; they live in panels.
  Whether they earn a canvas presence is the matrix-view question, still parked.

## 9. Write flow

`GET /api/declared-entities` → the file. `PUT /api/declared-entities` →
whole-file replace, relaxed escaping — the blacklist/assets/entity-tags pattern
exactly, including its known unauthenticated-write caveat and last-writer-wins
concurrency. Hand-editing remains a first-class write path.

## 10. Open items — resolved 2026-08-20, all as proposed

1. **File and section names.** Proposed: `declared-entities.json`, sections
   `onMachines` / `external`.
2. **`kind` vocabulary.** Proposed: free-form with suggestion chips (the §8.3
   precedent). Alternative: controlled list — buys glyph/iconography stability at
   the cost of a schema migration every time reality grows a kind.
3. **External subject in blast radius.** Proposed: in this arc — it is the payoff
   that justifies external entities. Alternative: park to a later slice and ship
   attribution + triage first.
4. **HTTP targets in the unresolved-endpoints stratum.** Proposed: listed verbatim
   from day one (no matching, so no §11.7 conflict). Alternative: database edges
   only until the alias work lands, at the cost of hiding the most common
   near-peer case.
5. **Delivery slicing.** Proposed two slices: **A** — file + store + machine-anchored
   entities + declare/classify in Triage + machine blast radius contribution;
   **B** — external entities + attribution + unresolved-endpoints stratum +
   external blast radius subject. A is useful alone (scheduled tasks land); B is
   where reconciliation complexity lives.
6. **Untagged declaration allowed.** Proposed: yes — declaring and classifying are
   separable; an untagged declared entity is just pile.
7. **Port handling on identifiers.** Proposed: identifier without a port matches
   any port on that host/scheme; identifier with a port matches only it. The
   loosest rule that is still exact-match-per-assertion. Alternative: port always
   required — stricter, but makes `https://api.partner.com` unmatchable without
   knowing every port variant in advance.

## 11. Verification plan — every branch needs a fixture

> **Slice A executed 2026-08-20, all green** — the machine-anchored branches below,
> plus live: the declare gesture end-to-end (duplicate name refused
> case-insensitively), classify 22→21 through the assertion bar, edit-with-emptied
> axes clearing tags while the untagged record survived the prune (§10.6 proved),
> Remove un-declaring outright, `tier` extension key surviving GET/PUT, the API
> GET→PUT→GET byte-identical, and the APPSRV01 blast panel answering
> `BillingSvc × prod — Nightly ETL sweep (scheduled-task)`. One gap found and
> fixed during verification: the canvas universe did not include machines named
> only by entity-tags/declared-entities, so their dangling findings existed in
> the stream but never rendered — OLDBATCH01 now draws as a ghost tile carrying
> `dangling-declared-entity` (a pre-existing hole for entity-tags too).
> **Slice B executed 2026-08-20, all green.** Fixtures: `Partner Payments API`
> (portless identifier matched WEB01:443 *and* the planted WEB02:8443 edge — the
> §10.7 loose rule; `api-backup` identifier "matched by 0 edges" smell) and
> `Partner Telemetry` (untagged → pile; `:9443` identifier matched only its port
> while the planted `:9080` edge stayed unresolved; `sql01.corp.local` identifier
> rendered *shadows SQL01 — the machine wins*). The unresolved stratum listed six
> targets verbatim including `https://portal.example.com` — a WEB01 site name the
> host index rightly does not resolve (bindings are §11.7's deferred territory),
> demonstrating verbatim-no-matching honestly. Live: the attribute gesture created
> `Billing Provider` from a row's input and the row left the pile; the declare
> form's external anchor wrote a full record; the fleet chip read 29
> (22 + 1 untagged external + 6 unresolved) fed by the canvas's new
> `externalPileCount`; `GET /api/blast-radius/external/Partner Payments API`
> answered `OrderPortal × prod → WEB01 portal.example.com/` (after a live classify,
> then reverted) with WEB02's dependent stated as unclassified, every edge badged
> *declared target*, never a verdict; DEVSQLBOX's machine answer byte-matched its
> slice-3 lines after the change.

The verification constraint holds: fixtures are the coverage. Demo tree additions
(`config/declared-entities.demo.json`, plus planted edges in the fixture
topology):

| Branch | Fixture |
|---|---|
| Machine-anchored, tagged | scheduled task on APPSRV01, `MyWeb × prod` — appears in dossier's declared section, machine rollup `derivedFrom`, and APPSRV01's blast radius as a declared hosted contributor |
| Machine-anchored, untagged | second task, no axes — unclassified stratum, marked declared; chip count includes it |
| Anchor machine gone | task declared on a machine absent from the tree — `dangling-declared-entity` finding |
| External, attributed | `Partner Payments API` with an endpoint matching a planted connection string on a demo web app — edge attributed, external blast radius answers with the app's deployment |
| External, HTTP edge | endpoint matching a planted http edge (scheme+host+port), path differing — still attributes (path excluded) |
| Unresolved endpoint | planted edge to a host that is no machine and no identifier — its own triage row; *attribute to…* appends the identifier and the row leaves the pile |
| Identifier matching zero edges | second identifier on the external entity matching nothing — "matched by 0 edges" smell in the panel, no finding |
| Identifier shadowing an estate machine | identifier naming a demo machine's alias — machine wins, smell shown, hosting/blast output unchanged |
| Port rule | identifier without port vs planted edges on two ports — both attribute; identifier with port — only its port |
| Round-trip | unknown key on a declared record survives GET/PUT (extension data) |
| Schema untouched | `entity-tags.json`, `/api/hosting`, `/api/entity-tags/triage` (existing strata) byte-identical before/after with an empty `declared-entities.json` |

Verified live rather than fixtured: the declare gesture end-to-end, bulk-classify
over a mixed observed+declared selection, and the blast-radius panel for the
external subject.
