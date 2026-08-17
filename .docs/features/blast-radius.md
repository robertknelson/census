# Blast radius — slice 3 of the system graph

> Spec, 2026-08-18. Parent docs: `system-graph-principles.md` (why),
> `entity-tags.md` (slice 1), `triage-workbench.md` (slice 2).
> Status: **ratified 2026-08-18 — all five §7 items decided as proposed
> (machine subject; action-bar entry; http edges excluded; contradicted
> stratum shown; HostResolver extraction). Build authorized.**

## 1. The question, and the shape of the answer

*If this machine goes down, what breaks?* — answered in **system × stage**
terms, not hostnames. The payoff line the whole arc has been building toward
(`system-graph.md` §6):

> DEVSQLBOX down → MyWeb (dev, val), YourWeb (dev, val) — three lines instead
> of eleven nodes.

The answer is a list of **deployments** (system × stage pairs) with, behind
each, the evidence: which hosted entities and which observed edges put it
there. Tags stop being the filter and become the labels on the answer; every
line stays traceable to a measurement or a named assertion, per the principles
doc.

## 2. What already exists — this slice mostly composes

- **Observed edges, inverted.** `HostingController.BuildDependencies` already
  groups edges by *target* — "blast radius needs the inverse" is written on it.
- **Host resolution with honest ambiguity.** `BuildDatabaseIndex` maps
  host-identifying names (netbios/fqdn/ipv4 aliases only — never certificate
  SANs or host headers) to machines, and *drops* a name claimed by two machines
  rather than guessing (decision H-5).
- **Corroboration verdicts.** `Corroborate` yields confirmed / contradicted /
  unobserved for a database edge, with `not-present` treated as proved absence
  and every other failure as ignorance.
- **Tags with resolution** (slice 1) label everything.

New here: walking from a subject machine, and the composition into deployments.

## 3. The subject is a machine

"This box dies" is the driving case and the failure unit hardware actually has.
Databases, instances, and applications as subjects can come later — a machine
subject already answers "what if the box under this database dies" by picking
its machine.

## 4. The traversal — one hop is the closure, today

Two ways to be in the blast:

1. **Hosted on the subject.** Every user database (all instances) and IIS
   application observed on the machine — they go down *with* the box.
2. **Depending on the subject.** Applications on *other* machines whose
   observed `database` edges resolve (via the host index) to the subject
   machine. Each carries its corroboration verdict.

With only application→database edges observed, nothing observed depends on an
application — so one hop **is** the transitive closure today, as a fact of the
data rather than a simplification. Declared edges that would change this are
parked (G-6).

**HTTP edges are out of scope** for impact: matching a URL host against
bindings estate-wide is the alias matching problem already deferred in
census-web.md §11.7, and half-resolving it here would join on exactly the
names H-5 refuses. When that work lands, http edges slot into the same
traversal.

## 5. Composing the answer

- Every impacted entity contributes its asserted `system` × `stage`
  cross-product to the deployment list: `Shared_REF` (MyWeb+YourWeb × ref)
  lands in two deployments. A dependent application contributes its own tags.
- **Untagged impacted entities land in an explicit "unclassified" bucket** —
  the pile leaking into the answer is signal, and the line links straight to
  the Triage panel. The answer never quietly shrinks because tagging is
  incomplete.
- **Unknowns are stated, not dropped**: unreachable instances on the subject
  ("what else runs on REPORTING is unknown"), failed categories, and
  `unobserved` edges each get a line. Same rule as everywhere: absence of
  evidence renders as unknown.
- **Contradicted edges into the subject** are their own stratum — "points here,
  but the target does not exist there." Not impact (the app was already
  broken or misconfigured), but config drift worth seeing while looking at
  this machine.
- Each deployment expands to its contributors: hosted entities (with instance/
  site addresses) and dependent applications (with source machine, edge name,
  source file, verdict). Measured facts and asserted tags stay visually
  distinct, as on the tiles.

## 6. Placement and API

- **Entry**: a **Blast radius** button in the Estate action bar when exactly
  one machine is selected — beside Details, the same gesture. Opens the
  standard slide-in panel.
- **API**: `GET /api/blast-radius/{machine}` computes the whole answer
  server-side: subject contents, resolved dependents, verdicts, tag joins,
  deployment grouping, unknowns. One read, recomputed per request, latest
  snapshots only. Current view only (disabled under as-of), like Triage.
- **Reuse, not copy**: the host index and corroboration move out of
  `HostingController` into a shared service the two controllers call — the
  same derivation kept in one place (the W-3 argument, applied to
  resolution). Hosting's behavior does not change.

## 7. Open items

1. **Subject kinds.** Machine-only this slice (proposed); database/application/
   instance subjects later if wanted.
2. **Entry point.** Action-bar button on single selection (proposed); a link
   from the dossier header could be added later without redesign.
3. **HTTP edges.** Excluded from impact, listed nowhere in the answer this
   slice (proposed) — they reappear with the deferred alias work. Alternative:
   list them unresolved under unknowns, at the cost of noise.
4. **Contradicted stratum.** Shown as "points here but contradicted"
   (proposed) vs omitted entirely.
5. **Extraction.** Moving `BuildDatabaseIndex`/`Corroborate` into a shared
   service (proposed `HostResolver`) — touches HostingController, behavior
   unchanged, verified by comparing `/api/hosting` output before and after.

## 8. Verification plan — executed 2026-08-18, all green

Demo profile; fixtures are the coverage. Results:

- **DEVSQLBOX** answered exactly as the fixture was built to force:
  `MyWeb (dev, val)`, `YourWeb (dev, val)` — hosted databases plus DEVWEBBOX's
  and VALWEBBOX's applications as dependents with confirmed edges (`MyDb →
  MyDB_DEV`, `LegacyDb → MyDatabase_DEV`, each naming its source file) — the
  two-environments-one-box coupling in six lines. `Shared_REF` contributed
  `MyWeb (ref)` and `YourWeb (ref)`.
- **PRODSQLBOX**: `MyWeb (prod)` includes `AppData01` — the name-blind path
  proved, since only the tag puts it there — with PRODWEBBOX apps as
  dependents.
- **DEVWEBBOX**: hosted applications only, no dependents — the correct
  asymmetry.
- **SQL01** exercised every stratum in one view: two classified deployments;
  four unclassified databases *plus* WEB01's untagged portal apps (confirmed
  edges) in the unclassified section with its Open Triage button; APPSRV01's
  intranet-app under *points here, but contradicted*; REPORTING/ARCHIVE as
  unknown lines.
- `/api/hosting` responded **byte-identically** before and after the
  HostResolver extraction.
- Live screenshots: the DEVSQLBOX answer with expanded contributors; the SQL01
  strata.
