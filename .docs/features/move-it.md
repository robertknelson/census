# Move It — where features and fixes are in the department

> Discovery note, 2026-09-14. **Unratified.** Brainstorm session, expansion
> not narrowing; nothing here is a spec and no build is authorized. Seeded by a
> Gemini conversation (sketches and loose DDL, dropped in as `move-it/notes.move-it.txt`
> and deleted 2026-09-14 once this note captured them) and reshaped against Census's principles
> (`system-graph-principles.md`). Parent docs: `systems-registry.md`
> (stages per system), `entity-associations.md` (stage belongs to the system
> claim), `triage-workbench.md` (the unexplained pile as the health metric).

## 1. The question

The governance reader cannot easily know where a feature or fix is: still with
the developers, deployed to DEV, in VAL/UAT, or in PROD. Today the answer lives
in emails and a weekly meeting. Move It is the idea of answering it from
evidence.

Context (2026-09-14): two web-development teams. Team A uses Azure DevOps;
Team B uses a Jenkins-based pipeline. Team B's application-tracking site
(health, ApiRequests, Errors, Messages for a dozen-plus apps across four
stages) is the one Census rests on. Team A's apps may join both the tracking
site and Census later. Move It is worth building against Team B regardless.
(Who the governance reader is, and the rest of the situation, lives in
`.docs/local/`, which never goes to GitHub.)

## 2. What moves

**The unit that moves is the release, not the build.** Builds land on DEV
continuously during a development phase; a single feature set, divided among
developers, staggers in over weeks. Tracking every DEV build is unsustainable
for one entrant and most of those builds are half-states nobody asks about. A
*release* is the named feature set for one app for one sprint. It is at a stage.
Builds are its evidence at a stage.

**Three events per release.**

| Event | Nature | Source |
|---|---|---|
| Promotion out of DEV (to VAL or UAT, team-dependent) | observed | health regime / collector |
| Client approval to deploy to PROD | human, unobservable | typed, with the approved build string |
| PROD arrival | observed | health regime / collector |

Promotion is the first moment "what's in it" matters outside the team, so it is
when the manifest gets written, once. Fixes arising from VAL/UAT testing are
appended to the same release as they land. Approval is the only transition that
leaves nothing on a box, and it is the state the governance reader most wants to see
("done, waiting on the client" vs "still being tested"). Recording the approved
build string lets observation later confirm that the build in PROD is the one
approved — a check nobody has today.

## 3. The join: the build string, verbatim

With no programmatic access to either pipeline, the only thing that crosses from
observed to asserted is the build identifier. Azure emits `yyyyMMdd.r`; Jenkins
emits an integer or a hash. It is recorded per app as an opaque string and
**never parsed**. Humans attach work items to it. The minimum manual record is
one line: *build 20260910.4 of app X contains fix F and feature G.*

## 4. Where the pieces live (direction, not decision)

**The transit ledger already exists.** The tracking site pings every
`/api/health` endpoint every ten minutes, 24/7/365. The Azure release pipeline
injects deployment info into appsettings, which the endpoint returns. So for
every app in the regime, "build B appeared at this endpoint at time T" is
already recorded to ten-minute resolution, with history. Gemini's
`analytical_transit_ledger` is a table that has been filling for years under
another name.

*Correction recorded 2026-09-14:* the deployment info is buried in the raw
health-response table, not yet extracted to a fact table. Robert's existing
slice-and-dice process that builds fact tables from responses could be enhanced
to extract distinct deployment events. Entirely in his control; a small slice.

**Coverage:** about half of Team B's apps expose the regime today; the team is
incorporating it across the board, expected complete within three months. Team
A: unknown what Jenkins puts on the box. **"Build unknown" is therefore a legal
state**, rendered honestly, never a dropped app. Coverage of the regime is
itself measurable and a lever for the rollout.

**The manual pieces would live in the tracking site** as a deliberately small
addition — Robert's phrase: "just enough," not a Jira. Holding:

- Release: app, name.
- Work item: name, kind (feature | fix), who built it, optional external
  reference (Team A's project-tool task ID), free text.
- Attachment: work item → build string.
- Approval event: release, date, approved build string.

No states on a work item. Its state is derived from where its builds are
observed. **The rule that keeps it small: it records what is *in a build*, not
what people *are doing*.** "Assigned dev" means who built it (provenance), never
who should build it (assignment). The moment it tracks intent it becomes a task
manager and drifts toward Jira.

The tracking site is also the natural home because it sees a new build first
(minutes, not nightly) and is the site developers already use — the long path
off Robert being the sole entrant is a dev saying "my task is in build
20260910.4" there.

**Census's part** shrinks to two things: (1) stage and machine truth for the
join — the tracking site knows a build reported from an app named `mywidgets`;
Census knows that IIS app is the val copy of Widget Core, on which box, alongside
what; (2) nightly fallback observation of deployed builds for apps outside the
regime (the collector's binary-provenance item, already HIGH in
`census-collector.md`), fading as the regime takes over.

**A finding for free:** the pipeline-injected stage (an assertion made by the
pipeline, carried by the app) vs Census's asserted stage for the same IIS app
(made by Robert). Agreement is silence; disagreement is a misconfigured release
variable or a val box serving prod config. Both sides are stated; neither is
parsed. Not inference.

## 5. The inbox prompts entry

Nobody opens a form unprompted. The system already sees "new build 20260910.4
appeared in DEV/VAL for app X, nothing attached." That is the inbox; the human
answers it at the weekly meeting. Same pattern as the triage workbench:
everything found is either explained or known-unexplained. Resolutions include
"superseded, skipped" for DEV churn that never promoted.

## 6. Constraints that shaped the above

- **HARD CONSTRAINT (2026-09-14): no real data here, of any kind.** Not in
  AppTrak (schema only, zero rows), not IIS logs, not census evidence. All
  data in the working environment is manufactured. Robert can move whatever
  is coded or scripted here into a real environment and report back; that
  round-trip is the only path to real-data answers. Consequences: every
  question needing real data is written as a `.sql` file for him to run
  there; every design branch that depends on real behaviour (e.g. Deploymentat
  on rollback) gets a fixture per possible behaviour, not a guess; AppTrak
  seed data is a deliberate fixture set in the spirit of `output-demo/` and
  `config/*.demo.json`, and it *is* the coverage.
- **No API and no export** from either team's CI/CD. Feature/fix contents of a
  build are manual, period.
- **Robert is the sole entrant for the foreseeable future** — deliberately. The
  Census rollout pattern applies: nobody else sees it until he is satisfied after
  several field-trial iterations on requirements and stabilization. Entry cost
  is therefore the binding constraint on granularity; per-release entry (write
  at promotion, append per fix, close at approval) is a handful of edits per app
  per sprint. Per-DEV-build entry would die in the field.
- **Feature sets reach Robert through two dialects**: Team A's project tool
  (task names and IDs), Team B's weekly meeting (verbal). If he holds the role
  he sets how he receives them; he has worked with all involved for years and
  expects no trouble. The work-item record stays loose enough for both.
- **Stages are per-system and ordered.** VAL vs UAT differs by team; the
  registry has `expectedStages` per system today but unordered. Ordering is a
  small, legitimate addition; "highest stage" and "skipped a stage" need it.
- **Servers per stage.** Eight years of one server per stage, sometimes one
  server for two stages. The latter is already handled (build is a property of
  the IIS app, not the machine). Multi-server per stage must be accounted for;
  the question is *agreement* across servers, not location. From the endpoint
  side it would present as a stage flapping between builds.

## 7. From the Gemini DDL — keep and drop

**Keep, renamed into Census/tracking-site vocabulary:** the transit ledger (as
observations, with "work item entered stage" a view over ledger × manifest);
the pipeline manifest (as human attachment, not registry); the unmapped-evidence
inbox (already the triage pattern); stage sequence.

**Drop:** realm, business domain, business capability, executive sponsor,
criticality tier, business value statement — taxonomy nobody asked for and
nobody will maintain; the CMDB-by-another-name Census rejected. **Drop the
topology resolver** — regex over connection-string database names to infer
stage and app is the 2025 failure rebuilt, and redundant: the health report
comes from an observed app that already carries an asserted system and stage.

The Mermaid in the notes does not render as-is (several `}` for `|`, a sequence
step targeting a nonexistent participant, three custom stages all labelled DEV).
Not worth fixing; this note supersedes it.

## 8. Storage — ratified 2026-09-14

Two different questions, answered differently.

**Census's logical layer stays in files.** The no-database ruling
(`census-web.md` §2) carries an explicit revisit trigger — fleet or retention
grows by an order of magnitude — and it has not fired. The whole assertion
layer is under 30 KB across seven `config/*.json` files; git already holds their
history and authorship (27 commits touching them to date); hand-editing is the
documented *primary* write path (`entity-tags.md` §3); Robert is the sole
writer, so last-writer-wins never fires. SQL Server would solve no pain that
exists. Moving now would be speculative engineering.

Triggers that reopen it, recorded so it is not re-argued:

1. A second person editing assertions — concurrency and authorization become
   real that day.
2. Team A doubling the estate with the collector reaching it, so evidence
   volume nears the original ruling's trigger.
3. A consumer that must join evidence to assertions at query time rather than
   in memory.

**Move It lives in SQL Server from day one** — not because SQL is better but
because its ledger is already there: the tracking site's health-response table.
Release, work item, attachment and approval are foreign keys onto app and build
string, which the extracted deployment fact table carries. Holding those
assertions in JSON on the Census side would separate them from their evidence
across a process boundary for no reason. Move It is a tracking-site feature
that *reads* Census; Census does not store it.

**Rejected explicitly:** moving Census's JSON into the tracking site's database
"since it's right there." It kills hand-editing, couples Census's deployment to
another app's database, and the read-both-forever / unknown-keys-round-trip
ethos of the assertion files is file-shaped. The posture toward the tracking
site is the one `graph-interop.md` settled toward the graph: Census supplies
observations as an overlay and never governs.

**Addendum, ratified 2026-09-14 — publish, don't move.** Move It's board needs
Census's system, stage and machine per endpoint as a SQL join. The tag shape
is still moving (flat axes became `serves` three weeks ago with no migration
event; SQL would have needed an ALTER and a data migration), fixtures are the
test coverage, hand-editing is the primary write path, and git is the audit.
So the files stay truth and Census *projects* its resolved semantic layer into
a `census` schema in AppTrak: endpoint, machine, system, stage, canonical
name, provenance, projected-at. Regenerable on every load, disposable, never
hand-edited; `graph-interop.md`'s overlay posture applied to AppTrak. Not dual
truth because derived, not owned. **Fourth trigger:** the tag shape stable for
several months *and* the projection proves insufficient — Move It needs to
*write* an assertion Census must see (the `monitoredAs` confirmation is the
test case). Then the question reopens with evidence.

**The design question underneath "storage" is identity across the seam.**
Census knows an IIS app by machine, site and path, with system and stage
asserted. The tracking site knows an app by the name in its health response.
Move It needs one human-asserted join between them. That is the thing to spec;
where the bytes sit follows from it.

## 9. Identity across the seam — ratified 2026-09-14

**What each side knows about a deployed app.** Census observes machine, IIS
site, app path, and bindings (protocol, IP, port, host header, certificate);
onto that leaf a human asserts `serves [{system, stages, canonicalName}]`.
The tracking site registers one endpoint per (app, stage) with a URL — the
friendly hostnames are host headers bound to certificates in IIS on each web
server, so Census sees them in bindings. The `/api/health` payload returns
`name, version, machine, stage, project, deployment.{at, branch, build,
buildid, sourceVersion}, connection-strings[].health,
downstream-services[].health, logging[].health` — the pipeline's claims,
carried by the app.

**Join level: endpoint, not system.** One assertion per registered endpoint
(≈ a dozen apps × four stages), stored on the Census side as a tag axis on the
IIS-application leaf in `entity-tags.json`, keyed by the tracking site's
(app, stage) identity and carrying the URL:

```json
"monitoredAs": {
  "app": "mywidgets",
  "stage": "val",
  "url": "https://mywidgets-val.corp.example/api/health",
  "assertedBy": "robert",
  "assertedAt": "2026-09-14"
}
```

Reasons: the ping is a fact about one endpoint and "which IIS app on which box
answered" is the question Census exists to answer; it is an assertion about an
observed thing, which is what the leaf already holds (unknown keys round-trip,
provenance for free); the dependency direction stays right (the tracking site
reads Census, Census stores nothing about Move It); a later observed build
lands on the same leaf, making it the meeting point of observed build, asserted
system/stage and asserted endpoint. Multi-server per stage (none in eight
years) is simply a second endpoint on a second leaf; nothing to build.

**Suggestion is near-exact; assertion is still a human gesture.** For a
registered endpoint Census can find the IIS app whose machine equals the
payload's `machine`, whose site binds the URL's host header, and whose app path
matches the URL path — exact equality on observed values, the same rule tags
use for names, not convention-sniffing. But the payload's `machine` is a claim
carried by the app (a proxy or container can report a different name), so
Census presents the match in the inbox and Robert confirms once per endpoint.

**Four voices, one endpoint — disagreement after assertion is a finding.** The
payload (name, stage, machine); the registration (app, stage, URL); Census
(system, stage, machine); the binding (host header). Any pair disagreeing means
a release variable on the wrong slot, a friendly URL moved to another box, or a
val app serving prod config. Every case hangs on an honest machine, so it rides
the machine-keyed findings stream.

**Vocabularies.** App names are *typically* the Census system name — typically
is not always, so the assertion stores the tracking app name explicitly and
the picker pre-fills on a match. Stage strings: Robert owns both sides; make
them identical, no mapping table.

**`project` is not a team label.** It is not exactly the Azure DevOps project
name — the .NET Framework "Widget" project and the .NET "Widget" project both
exist — and the names follow no consistent convention. Record it verbatim as
payload evidence; derive nothing from it. Team stays a human assertion (open
item 6).

**`deployment.sourceVersion` reopens a door.** No pipeline API, but a commit
SHA per deployed build means that with *read access to the repositories* the
changes between the previous build's SHA and this one are a `git log` away.
Commit messages are not work items, but they are a strong prompt for the
manifest — and for Team B's verbal process, possibly the only written record.
Whether Robert can clone both teams' repos is open item 9; it is a different
question from API access.

**In passing:** `connection-strings[].health` is the app stating which
databases it talks to — a second voice on the edge Census observes from
`web.config`. Not Move It; blast radius's business, and already in the table.

## 10. AppTrak as found, and the first slice — ratified 2026-09-14

**The tracking site is AppTrak** (local SQL Server database `AppTrak`; code
not yet in reach). Schemas seen: `health`, `core`, `log`, `appgraph` (the
dependency graph from `graph-interop.md` lives here). Conventions: schema per
area, `Id` identity PKs, `datetimeoffset` with `sysdatetimeoffset()`
defaults, `Uid nvarchar(36)`, Session/Correlation ids, denormalized
name-beside-id columns, no foreign keys in `health`, no procs or views.

- `health.HealthReport` — one row per ping; **Build, BuildId, SourceVersion,
  Branch, Deploymentat are already typed columns.** The ledger source; the
  extraction is a `GROUP BY`, not a parse.
- `health.HealthEndpoint` — the (ApplicationId, Stage, Url) registration. No
  unique constraint on (ApplicationId, Stage): the multi-server door is
  already open.
- `health.HealthFact` — per check, not per deployment (`DeployBuild` is 25
  chars against `HealthReport.Build`'s 50; `DeployAt` is a string). Not the
  source for deployments.
- `core.SelectItem` (`Grouping`, `Sort`) — the lookup pattern. ~~**Stage
  sequence lives here** as rows grouped `Stage`; DEV, VAL and UAT peers, PROD
  above. No new table; supersedes §6's "add ordering to the registry".~~
  **Misread** (2026-09-17, Robert): `SelectItem` is a single-table recursive
  hierarchy — a list is a header row with `MasterId = -1`, its members carry
  `MasterId = header.Id`; `Grouping` only groups options inside a dropdown.
  Our 17 rows were all headers. Open item 18 holds the rework.
- **No Application table in this database.** `ApplicationId` references
  nothing here. Where the registry lives is open item 10; team ownership
  attaches to it once found. *Corrected 2026-09-14 evening, from Robert's
  own review of the real schema:* the local copy is incomplete. The real
  AppTrak has the tables that let a team register its applications and
  endpoints, plus an authorization table, and a handful more. They are
  missing here, not absent there. He brings them; the board waits.

**Decisions that were waiting on the schema (item 3 of the preconditions):**
gates as rows in a `moveit.ReleaseEvent` table (kind, at, build, by, note),
so "verified in VAL" is a row one may or may not write; team on the
Application registry, nullable; stage sequence in `core.SelectItem`.
Observed evidence stays in `health`; assertions go in a new `moveit` schema —
the observed/asserted line, drawn in SQL. *Amended 2026-09-17, Robert's call:*
the ledger is `moveit.Deployment`, not `health.Deployment`. It is derived from
`HealthReport` and owned by Move It, so it sits with Move It's other tables;
observed-versus-asserted is the row's provenance (`ReportId`), not the
schema it lives in. `health` stays untouched by this work.

### 10.1 First slice — `moveit.Deployment`, written by the report processor

Robert's proposal, ratified with four refinements: the HealthReport
processing code inspects each report's deployment block and, if it differs
from the most recent row for that endpoint, inserts a row. One table where
deployment changes are recorded.

1. **Compare the whole tuple**, not just Build: Build, BuildId,
   SourceVersion, Deploymentat, Machine, Branch. A rollback is the same Build
   with a new Deploymentat (rollback is the only reason a build ever
   redeploys; rare outside PROD, uncommon in PROD). A move is the same Build
   on a new Machine. Both produce a row.
2. **Insert-only, with one back-pointer update.** A new row sets
   `SupersededAt` on the endpoint's previous row — one update per deployment,
   not per ping. Intervals come free; the table stays a ledger.
3. **Observed and claimed timestamps are separate columns.** `DetectedAt` is
   the StartAt of the detecting ping (our fact); `Deploymentat` is what the
   pipeline injected (the app's claim).
4. **Absence is not change.** A failed ping, empty content, or a payload with
   no deployment block inserts nothing and supersedes nothing — half the apps
   lack the block today, and a 500 at 3am is not an undeploy. Census's rule
   for a collector section that did not run.

```sql
CREATE TABLE moveit.Deployment (
    Id              bigint IDENTITY NOT NULL,
    Uid             nvarchar(36)   NOT NULL DEFAULT (newid()),
    ApplicationId   int            NOT NULL,
    EndpointId      int            NOT NULL,
    Application     nvarchar(50)   NOT NULL,   -- as reported
    ReportedStage   nvarchar(25)   NOT NULL,   -- payload's claim; registration stage via EndpointId
    Machine         nvarchar(50)   NOT NULL,   -- as reported
    Project         nvarchar(50)   NULL,       -- verbatim, never interpreted
    Version         nvarchar(25)   NOT NULL,
    Build           nvarchar(50)   NOT NULL,
    BuildId         nvarchar(50)   NULL,
    SourceVersion   nvarchar(50)   NULL,
    Branch          nvarchar(50)   NULL,
    Deploymentat    datetimeoffset NOT NULL,   -- pipeline's claim
    DetectedAt      datetimeoffset NOT NULL,   -- StartAt of the detecting ping
    ReportId        bigint         NOT NULL,   -- the raw evidence row (HealthReport.Id; renamed from HealthReportId 2026-10-01)
    PreviousId      bigint         NULL,       -- prior row for this endpoint
    SupersededAt    datetimeoffset NULL,       -- set when the next row lands
    CreatedAt       datetimeoffset NOT NULL DEFAULT (sysdatetimeoffset()),
    CONSTRAINT PK_Deployment PRIMARY KEY CLUSTERED (Id)
);
CREATE INDEX IX_Deployment_Endpoint ON moveit.Deployment (EndpointId, DetectedAt DESC);
```

`PreviousId` makes rollback a self-join (same Build as an earlier row for the
endpoint). `ReportId` is the raw-evidence reference — the one Gemini
column kept by name. `Project` is stored only because the payload is being
opened anyway, and only verbatim. No `IsRollback` or any stored judgment:
facts stored, judgments derived.

**Backfill uses the same comparison.** A `LAG` over `HealthReport`
partitioned by EndpointId, ordered by StartAt, yields identical rows from
history, ReportId included. Two producers, one rule — simplest guarantee
is running the live code path over history rather than writing the rule twice.

**Resolved on real data 2026-09-17** (open item 1's history query): the rollback
result set returned rows Robert recognised as rollbacks he remembers, so the
pipeline stamps a fresh Deploymentat on a redeploy (fixture variant A). The tuple
compare catches rollbacks; question 08 found three in history. §12.1.

### 10.2 The `moveit` schema — ratified 2026-09-14

Assertions, in a schema of their own beside the observed `health` tables.
Six tables, five `core.SelectItem` groupings, everything else derived by
query. "Just enough" — it records what is *in a build*, never what people are
*doing*.

```sql
CREATE TABLE moveit.Release (
    Id            int IDENTITY   NOT NULL,
    ApplicationId int            NOT NULL,
    Name          nvarchar(100)  NOT NULL,   -- "Sprint 42", "Q3 mortgage changes"
    Kind          nvarchar(25)   NOT NULL,   -- SelectItem ReleaseKind: featureset | hotfix (asserted intent)
    TargetDate    date           NULL,       -- planned PROD; actual is moveit.Deployment
    Note          nvarchar(max)  NULL,
    CreatedAt     datetimeoffset NOT NULL DEFAULT (sysdatetimeoffset()),
    CreatedBy     nvarchar(50)   NOT NULL,
    CONSTRAINT PK_Release PRIMARY KEY CLUSTERED (Id)
);

CREATE TABLE moveit.WorkItem (
    Id              int IDENTITY   NOT NULL,
    ReleaseId       int            NOT NULL,
    Kind            nvarchar(25)   NOT NULL,   -- SelectItem WorkItemKind: feature | fix
    Title           nvarchar(200)  NOT NULL,
    Description     nvarchar(max)  NULL,
    BuiltBy         nvarchar(50)   NULL,       -- who built it: provenance, never assignment
    ExternalRef     nvarchar(100)  NULL,       -- Team A's task id, verbatim
    IncludedInBuild nvarchar(50)   NULL,       -- first build containing it, verbatim; NULL = with the devs
    FoundInStage    nvarchar(25)   NULL,       -- for fixes: where the defect was found
    RemovedAt       datetimeoffset NULL,       -- pulled from the release
    RemovedNote     nvarchar(255)  NULL,
    CreatedAt       datetimeoffset NOT NULL DEFAULT (sysdatetimeoffset()),
    CreatedBy       nvarchar(50)   NOT NULL,
    CONSTRAINT PK_WorkItem PRIMARY KEY CLUSTERED (Id)
);

CREATE TABLE moveit.ReleaseBuild (                -- assertion: build B belongs to release R
    Id        int IDENTITY   NOT NULL,
    ReleaseId int            NOT NULL,
    Build     nvarchar(50)   NOT NULL,   -- verbatim
    Note      nvarchar(255)  NULL,
    CreatedAt datetimeoffset NOT NULL DEFAULT (sysdatetimeoffset()),
    CreatedBy nvarchar(50)   NOT NULL,
    CONSTRAINT PK_ReleaseBuild PRIMARY KEY CLUSTERED (Id)
);

CREATE TABLE moveit.ReleaseEvent (                -- human events only; observed ones are moveit.Deployment
    Id        int IDENTITY   NOT NULL,
    ReleaseId int            NOT NULL,
    Kind      nvarchar(25)   NOT NULL,   -- SelectItem EventKind, see below
    Stage     nvarchar(25)   NULL,       -- the stage the event speaks about
    Build     nvarchar(50)   NULL,       -- the build it speaks about, verbatim
    At        datetimeoffset NOT NULL,   -- when the humans did it
    [By]      nvarchar(50)   NOT NULL,   -- who did it (the approver, the tester)
    Note      nvarchar(max)  NULL,
    CreatedAt datetimeoffset NOT NULL DEFAULT (sysdatetimeoffset()),
    CreatedBy nvarchar(50)   NOT NULL,   -- who recorded it
    CONSTRAINT PK_ReleaseEvent PRIMARY KEY CLUSTERED (Id)
);

CREATE TABLE moveit.WorkItemLink (                -- directed, feature-level dependency
    Id               int IDENTITY   NOT NULL,
    WorkItemId       int            NOT NULL,   -- the dependent side
    LinkedWorkItemId int            NOT NULL,   -- the thing it needs
    Kind             nvarchar(25)   NOT NULL,   -- SelectItem LinkKind: dependsOn | relatedTo
    Note             nvarchar(255)  NULL,
    CreatedAt        datetimeoffset NOT NULL DEFAULT (sysdatetimeoffset()),
    CreatedBy        nvarchar(50)   NOT NULL,
    CONSTRAINT PK_WorkItemLink PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT UQ_WorkItemLink UNIQUE (WorkItemId, LinkedWorkItemId, Kind)
);
```

Plus `moveit.Deployment` (§10.1) as the observed side: six tables in all.

**Lookups (`core.SelectItem` lists, AppTrak's shape — amended 2026-09-17):**
a list is a header row (`MasterId = -1`, `Identifier` the list name,
kebab-case) and its members carry `MasterId = header.Id`; `Grouping` is
dropdown grouping only, left NULL; readers filter `IsShow = 1` and order by
`Sort`. Move It's four: `release-kinds` featureset | hotfix; `work-item-kinds`
feature | fix; `link-kinds` dependsOn | relatedTo; `event-kinds` approved |
verified | hold | resumed | note | abandoned | deployed-asserted. The Kind
columns store the member `Identifier`. **Stages are AppTrak's own `stage`
list**, read, never written; `Sort` is the sequence (DEV, VAL and UAT peers,
PROD above). Adding a kind is data, not DDL. *Amended 2026-09-21 (§17):*
only the list's **seen** stages count — a registered `health.HealthEndpoint`
or a `ReleaseEvent` names it — in the board and in every question's `stg`.

**Rules.**

1. **Gates hold only human events.** Promotion and PROD arrival are in
   `moveit.Deployment`; storing them again is dual truth. `ReleaseEvent`
   holds what leaves no trace on a box.
2. **Release kind is asserted; composition is derived.** Features-only,
   fixes-only or mixed falls out of work-item kinds. *Hotfix* is intent — a
   fix that skipped the development phase, branched from PROD while the
   sprint continues in DEV — so it is claimed. A hotfix containing a feature
   is a visible contradiction.
3. **Builds are attributed to releases** (`ReleaseBuild`) because hotfix
   breaks the single-lineage assumption: a hotfix build lands on PROD while
   sprint builds keep landing on DEV, interleaved in time. One row per build
   that matters, written at promotion with the manifest; DEV churn needs
   none. `moveit.Deployment.Branch` is a *suggestion* for attribution and
   kind in the inbox — one click to confirm, never a rule.
4. **One build per work item; membership derived.** A work item enters at
   one build and is in every later one. "What is in build B" = work items of
   *B's release* whose `IncludedInBuild` was detected (`moveit.Deployment.
   DetectedAt`, DEV endpoint) no later than B, ordered within that release's
   builds only. Order from observation, never from parsing build strings.
5. **Where a feature is, in one query** — *refined 2026-09-14 while building
   `01-where-is-everything.sql`:* a work item is at stage S if some build
   holding it was ever deployed at S **and the build at S now is not older
   than that build**, "older" meaning first seen anywhere for the app, from
   evidence, never from parsing. Rule 4 alone was wrong: Sprint 42's work is
   still in PROD after the hotfix replaced its build, and rule 4 would have
   said it vanished. The refinement carries items forward through later
   builds (next sprint, a hotfix branched from PROD) and drops them on a
   rollback, because a rollback puts an *older* build back. No lineage table
   needed; reverts stay explicit via `RemovedAt`. Highest such S is the
   answer. No first build = with the devs; app with no evidence at all = no
   evidence; `approved` with no later PROD deployment = awaiting deploy;
   `hold` with no `resumed` = parked, with the reason. All of §2's states,
   none stored.
6. **`deployed-asserted` is declared evidence** for apps outside the health
   regime (Team A until they report): carries provenance, renders as declared
   everywhere, never counts as observed, never corroborated. Without it Move
   It says nothing about Team A for as long as a year.
7. **A coordinated release is derived**: whatever set of releases across apps
   is connected by `dependsOn`/`relatedTo` links. From it: order violation (a
   dependent work item observed in a higher stage than its dependency —
   gateway in PROD, downstream in VAL); ready-to-approve (every dependency at
   least at VAL); where-is-the-whole-thing; orphaned dependency (linked
   target removed from its release).
8. **Three layers of the same dependency check each other:** the payload's
   `downstream-services[]` (observed), `appgraph` edges (asserted, app
   level), `WorkItemLink` (asserted, feature level). A link between apps with
   no `appgraph` edge is a smell in either direction — inbox suggestion, not
   a constraint.
9. **Every Appendix A answer is a `.sql` file under `moveit`**, one per
   question; the board and the inbox read them. A wrong answer is a wrong
   query, fixed without touching a table.

**Parked, deliberately:** effort/hours/estimates (Team A's tool; tracking it
here is what makes this Jira); client and team (Application registry, open
item 10); a coordinated-release entity (derived); a release version label
(`moveit.Deployment.Version` at the attributed build); audit in the
PreviousValue/NewValue pattern (the day a second person writes); release
closure (derived: last attributed build in PROD, or `abandoned`).

**Where the spec goes.** This section is the record of what was decided; the
proper data-model spec moves to AppTrak's repository beside the tables when
the code is in reach (open item 11). Census keeps a seam contract for the
`monitoredAs` axis (§9).

## 11. Artifacts in this repo — built and fixture-verified 2026-09-14

Parked under `apptrak/` until AppTrak's repository is in reach (open item 11); the
move is a cut-and-paste. Everything idempotent. Calls made while building them are in
`.docs/calls-made-for-you.md`.

| File | For | Notes |
|---|---|---|
| `apptrak/sql/001-create-deployment.sql` | both | §10.1 table; unique on ReportId; `moveit.BackfillRun` (§21.1) |
| `apptrak/sql/002-create-moveit-schema.sql` | both | §10.2 tables; no FKs, matching AppTrak |
| `apptrak/sql/003-lookups.sql` | both | the four `core.SelectItem` lists (header + members), insert-only; the stage list is AppTrak's |
| `apptrak/sql/backfill-deployment.sql` | both | **the rule**, in SQL; the live processor implements exactly this |
| `apptrak/sql/history-deployment-episodes.sql` | real only | read-only; three questions to bring back (open item 1). Executed against the fixtures 2026-09-14 evening: parses, all three sections return — the morning risk is the answers, not the syntax |
| `apptrak/seed/seed-apptrak-demo.sql` | here only | the fixtures — 13 endpoints, 131,040 pings, 8 releases |
| `apptrak/Invoke-AppTrakDemo.ps1` | here only | runs DDL, lookups, seed, backfill against local `AppTrak` |
| `apptrak/Invoke-AppTrakManifests.ps1` | both | §14: loads release manifests into `moveit`, parameterised, re-runnable, never deletes |
| `apptrak/sql/manifest/*.sql` | both | the loader's statements, one per row kind, values as parameters |
| `apptrak/manifests/demo/*.json` | here only | two fabricated manifests; loaded with `-By demo-manifest`, removed by the seed |
| `apptrak/sql/board/history.sql` | both | §15: the ledger newest first with the claiming release |
| `apptrak/sql/board/releases.sql` | both | §15: the entry form's release picker |
| `apptrak/sql/manifest/workitem-attach.sql` | both | §15: set `IncludedInBuild` once, where null |
| `apptrak/sql/board/events.sql` | both | §16: every human event |
| `apptrak/sql/board/release-builds.sql` | both | §16: claimed builds and where the ledger has them now |
| `apptrak/sql/manifest/workitem-pull.sql` | both | §16: `RemovedAt` + note, once |
| `apptrak/sql/manifest/workitem-retitle.sql` | both | §16: title in place, by Id |
| `apptrak/sql/questions/01`–`12-*.sql` | both | one read-only `.sql` per Appendix A question (rule 9); the board and the inbox read these |
| `apptrak/sql/questions/13-feature-picture.sql` | both | §17: everything about a feature as one JSON document, filterable |
| `apptrak/sql/manifest/release-delete.sql` | both | §17: stabilization only — a release and everything asserted under it |
| `apptrak/Invoke-AppTrakQuestions.ps1` | both | runs every question; against fixtures it is the proof, against real data it is the first board |
| `.docs/move-it-morning-guide.md` | real | the step-by-step for the first real-environment run: recon, DDL, backfill, first board, processor rule, report-back |
| `apptrak/sql/board/stages.sql`, `applications.sql` | both | the board's two lookups (§13); read-only |
| `Census.Web` — `Views/Home/MoveIt.cshtml`, `wwwroot/js/moveit/*`, `wwwroot/css/moveit.css`, `Controllers/Api/MoveItController.cs`, `Services/MoveItQuestions.cs`, `Options/MoveItOptions.cs` | here (Census) | the board, level 1 (§13); mounted only with a `MoveIt:ConnectionString` |

**The twelve questions, and what the fixtures made each one show** (all run
clean 2026-09-14):

| # | Question | Fixture proof |
|---|---|---|
| 01 | where is every work item | 16 rows: Sprint 42 carried into PROD by the hotfix; Sprint 43 back to DEV after rollback; one removed; one with the devs; Ledger "no evidence"; Team A at PROD/UAT by assertion |
| 02 | release status: composition, highest stage, hold, past target | hotfix = fixes only; two releases on hold with reasons; three past target |
| 03 | order violations, current and historical | Audit viewer in PROD over Audit trail in DEV (current); Portfolio dashboard beat its dependency to PROD by one day (historical) |
| 04 | ready to approve | Q4 statements ready; Q4 letters blocked on a fix still with the devs |
| 05 | inbox: unattributed builds, PROD without manifest, attributed-unseen | the three pre-window builds; Ledger's never-seen build |
| 06 | registration vs payload stage | endpoint 22 |
| 07 | servers disagree, now and history | 24 hours on WidgetCore PROD |
| 08 | rollbacks with variant | three, both variants named; the machine move correctly absent |
| 09 | lead time and VAL round-trips | Sprint 43: zero round-trips, it skipped VAL |
| 10 | hotfixes and escaped defects | hotfix landed 11 days into Sprint 43; one PROD escape vs two caught in VAL |
| 11 | regime coverage | observed / pinged-no-block / asserted-only verdicts per app |
| 12 | approval vs PROD | one deployed-before-approval (the phone call), one PROD-without-approval |

**Coverage the seed exercises deliberately** (each verified by query after the backfill,
39 `moveit.Deployment` rows, the count the map predicts): DEV churn and two promotions;
a fix landing after VAL testing; a hotfix interleaved with the next sprint; rollback
variant A (fresh Deploymentat) on WidgetCore PROD; rollback variant B (original
Deploymentat) on Reporting PROD; a machine move on the same build; twelve hours of 503s
inside a stable episode producing no row; a partial deploy across two PROD servers; a
registration/payload stage mismatch; an app that never sends a deployment block (zero
rows); an app with no health regime, moving only by `deployed-asserted` events; Jenkins-
style build ids; a removed work item; a `hold` with its reason; one historical and one
current cross-app order violation; two Team A releases at UAT awaiting approval, one
ready and one blocked; a hotfix deployed before its approval was recorded; a PROD deploy
with no approval at all; a release that skipped VAL. A second backfill inserts nothing and
refreshes no back-pointers.

**Known blind spot, by design:** a redeploy of the same build with no intervening build
and an unchanged Deploymentat is invisible to any observer of the payload.

**Verified here, fixture-only.** Nothing has touched real data. The real environment's
first run of `001`–`003` and the backfill is Robert's, and the history query results
decide which rollback variant the fixtures got right.

## 12. Open items

### 12.1 The real run, 2026-09-17 — reported from memory

Robert ran `.docs/move-it-morning-guide.md` against the real AppTrak. Nothing
leaves that environment, not even a result file, so this is his recollection
against the guide's nine report-back items. Counts are his; nothing here is
data.

| # | Asked | Answer |
|---|-------|--------|
| 1 | Three history result sets | All three "look good"; episodes read as deployments he remembers |
| 2 | Rollback variant | Result B had rows he recognised: **variant A**, fresh `Deploymentat` on redeploy |
| 3 | `Deploymentat` with no block; `HealthReport.Stage` source | **Not brought back** — item 12 |
| 4 | Real stage names | **Already existed in `core.SelectItem`** before 003 ran — item 14 |
| 5 | Backfill | 26 inserted, `Broken` 0, second run 0 inserted; minutes not noted |
| 6 | News in 06, 07, 08 | None. 06 and 07 empty; 08 three rollbacks, all remembered |
| 7 | Inbox count from 05 | **No rows** — item 13 |
| 8 | Processor change | Will not ship for at least 2–4 weeks — item 17 |
| 9 | Items 9, 10, 11 | Nothing new |

Full set executed clean. 01–04, 09, 10, 12 empty, as the guide said they must be
with `moveit` empty. 11 returned 19 applications and 32 endpoints without
evidence, "looks correct", in 59 seconds — item 16.

### 12.2 The list

1. ~~Extract distinct deployment events into a fact table.~~ Shape ratified
   as `moveit.Deployment` (§10.1), built (§11). ~~Still owed: run
   `apptrak/sql/history-deployment-episodes.sql` against real data.~~ Run
   2026-09-17 (§12.1): episodes recognisable, rollback variant A, coverage
   plausible. Two details from Result C were not brought back — item 12.
2. Backfill: for apps already in the regime, reconstruct release history from
   ping history and attach manifests to past builds from the emails. Zero new
   collection code; the field trial's first exercise. On 2026-09-17 the inbox
   (05) was empty, so there is nothing observed past DEV to attach a manifest
   to yet — item 13 says why that is probably right.
3. What does Team A's Jenkins job put on the box? A version in the assembly or a
   text file in the deploy folder is observable by the collector without an
   endpoint.
4. ~~Whether the ledger's *presentation* (the "where is it" board) lives in the
   tracking site or Census.~~ Resolved 2026-09-14: a Census module, because in
   the deployed environment Census is hosted inside AppTrakWeb — the two apps are one
   process, and the board reads AppTrak's database from inside AppTrak. §13.
5. Whether "verified in VAL" is a state the governance reader wants distinct from
   "in VAL" — decides whether a second human gate exists.
6. Team ownership on release/work item — with two teams under one specialist it
   is the first cut he will want; none of the sketched DDL had it.
7. ~~Whether the `move-it/` folder is deleted once this note is ratified.~~
   Deleted 2026-09-14; this note supersedes it.
8. **Team A's servers are AWS, administered by a separate infrastructure
   team.** Unknown (2026-09-14) whether the collector can run against them.
   Matters little to Move It — the build string arrives over HTTP from the
   app, no server access needed — and much to Census's inventory of those
   machines. Honest shapes, in preference order: collected by proxy (infra
   team runs the portable collector, hands over JSON; evidence stays
   observed); declared entities with provenance (`declared-entities.md`,
   never corroborated, never counted as observed); or absent from Census,
   with stage asserted on the app as the tracking site knows it and the
   machine join simply missing. Never asserted evidence dressed as observed.
9. Read access to both teams' repositories — decides whether
   `deployment.sourceVersion` can prompt manifests from commit history.
10. ~~Where AppTrak's Application registry lives.~~ In AppTrak; the local
   copy lacks it (2026-09-14 evening, his schema review): application and
   endpoint registration, authorization, and a handful more tables are
   missing here. **Owed by Robert: the schema for those tables**, as DDL
   with zero rows (the hard constraint holds). Until then: the board shows
   unnamed apps by id, `applications.sql` names from the payload only, and
   **level 2 of the board is parked** — its application page hangs off the
   registry (name, team, endpoints), so building it against a guessed shape
   would be rework. Team ownership attaches here; the `monitoredAs` picker
   suggests from here.
11. AppTrak's repository in reach — the `moveit` data-model spec and the
   `.sql` files live there, not here. Until then they are parked under
   `apptrak/` (§11).
12. **Two Result C details, not brought back 2026-09-17:** what
   `HealthReport.Deploymentat` holds on a ping with no deployment block (the
   seed assumed `0001-01-01`), and whether `HealthReport.Stage` is the
   registration's stage or the payload's. Both stay as unconfirmed calls in
   `calls-made-for-you.md`. Next real visit: one query each; an answer from
   memory is enough.
13. **05 returned no rows on real data.** With item 14's reading, the
   questions ran against the four `Stage` rows 003 inserted (our Sort, our
   names), so the join worked and the inbox is honestly empty: only DEV
   endpoints send deployment blocks today, nothing has been *observed* past
   DEV, and 11's 32 endpoints without evidence are the VAL/UAT/PROD ones. 26
   deployment rows across the whole history fits a regime that is young.
   Robert entered the rows by hand in the real environment, so the join had
   real members to read; the inbox is empty because nothing is observed past
   DEV. Honest.
14. ~~003 wrote seventeen list headers into the real `core.SelectItem`.~~
   Moot (2026-09-17, Robert): he entered the records properly by hand in the
   real environment, and everything ran. No cleanup, no restore. What 003
   does in *this* repo is item 18.
15. **Backfill on real data:** 26 rows, `Broken` 0, second run 0. Minutes not
   recorded; bring the number next time so the processor's batch cost is
   known. 26 episodes over the whole ping history is small — see item 13(a).
16. **Question 11 took 59 seconds on real data** (19 applications, 32
   endpoints). The two correlated subqueries per endpoint scan `HealthReport`.
   Not on the board today, so nothing to do here; when it is, the fix is an
   index on `HealthReport (EndpointId, IsSuccess, StartAt)` or a
   last-good-ping column AppTrak maintains — AppTrak's change (item 11). 01's
   cost on real data is unmeasured: it returned no rows because `moveit` is
   empty.
17. **The processor change (guide Part E) will not ship for at least 2–4 weeks
   from 2026-09-17.** Until it does, `moveit.Deployment` stops at the
   backfill's watermark. Re-run `backfill-deployment.sql` before any
   real board reading; it is idempotent and prints what it added. The
   two-producer test waits on the processor. **2026-09-24: no SQL Agent on
   the real server for Robert** — he can only run scripts by hand in SSMS,
   so `004-create-backfill-job.sql` is shelved there. The backfill is a
   manual step: open the file in SSMS and execute, before reading the board.
   A gap of any length is caught up in one run. Once the processor ships the
   manual run is no longer needed.
18. ~~003 and the fixture should mirror what Robert entered by hand.~~ Done
   2026-09-17 from the query shape he gave (`x.MasterId = y.Id`, header
   `Identifier` in kebab-case, `IsShow = 1`, `ORDER BY Sort`): 003 writes the
   four lists as header + members, insert-only; the eight `stg` CTEs and
   `board/stages.sql` read AppTrak's stage list by header; the fixture seed
   stands in a `stages` list locally. **One value guessed:** the real stage
   list's header identifier was assumed `'stage'`; Robert: `'stages'` (2026-09-17) (his three examples were
   `release-kinds`, `event-kinds`, `work-item-kinds`). If it is something else,
   it is one literal in nine files. Member identifiers stay as ratified
   (`featureset`, `dependsOn`, …); if his hand-entered members differ, the
   Kind columns' values differ with them — bring the list.

## 13. The board — the governance reader's page (ratified 2026-09-14; level 1 built)

**Who it is for.** Estate and Atlas are Robert's views. The board is the third
module and the first one built for someone else: the governance reader, the
governance persona of `census-web-v2-ux.md` §2, strictly read-only, thinking
in groups. One landing page they can navigate without Robert in the room.

**Where it lives — item 4 resolved.** In the deployed environment Census already
runs inside AppTrakWeb; the board is a Census module, and in production it
reads AppTrak's database from AppTrak's own process. Nothing crosses a
network seam. The consequence for this repo is honest and small: the board
is the first Census code that reads SQL. It takes an optional connection
string to `AppTrak`; absent, the module is not mounted. Estate and Atlas keep
reading files and are untouched.

**Shape — the Estate/Atlas pattern, third instance.** Own Razor page, own JS
tree, own CSS, own API controllers; shared stores only.

| Piece | Location | Note |
|---|---|---|
| Landing | `Views/Home/MoveIt.cshtml` | one `<div id>` and a module `init`, as Estate |
| Front end | `wwwroot/js/moveit/*.mjs`, `css/moveit.css` | page singleton + one panel class per question |
| API | `Controllers/Api/MoveIt*` | one endpoint per question; runs the question's `.sql` file verbatim |
| SQL | `apptrak/sql/questions/*.sql` | the same files, path configurable; no SQL in C# (rule 9 and the coding standard agree) |

**Navigation — three levels, filter by application throughout.**

1. **Dashboard.** Question 01 as the spine: every open work item and its
   stage, grouped by application. Beside it the counts that answer the
   weekly-meeting questions at a glance: at each stage, past target, on
   hold, reached PROD this week, awaiting approval (02, 04, 12).
2. **Application.** Its releases in target order, each with composition,
   highest stage, hold and reason (02); its builds per stage and whether
   servers agree (07); its order violations (03).
3. **Release, then work item.** The release's events in time (deployed,
   asserted, approved, held) and the builds that carried it; a work item's
   trail from "with the devs" to wherever it is now.

Team is the second filter, added the day the Application registry is found
(items 6 and 10); the fixtures already carry it.

**Growth is the design assumption.** A new question is a new `.sql` file, a
new endpoint, a new panel; the page singleton composes them. The twelve are
the first board, not the board. Questions 05–11 are architect's questions
and stay off the governance reader's landing page until asked for; the inbox (05)
is Robert's queue and belongs to the dev-ops side.

**Built here against the fixtures.** The local `AppTrak` database from
`Invoke-AppTrakDemo.ps1` is the whole test bed; the fixture proofs in §11
are the acceptance list, screen by screen. Nothing real touches this repo.

**Level 1, built and browser-verified 2026-09-14.** Route `/moveit` (working
name). The spine is question 01 drawn as *lanes*: one row per application,
one column per lane, every open work item a chip in the lane the evidence
puts it at. Lanes are the stage sequence from `core.SelectItem`, peers (VAL
and UAT, equal `Sort`) sharing one lane, with two lanes before the first
stage for "with the developers" and "built, not seen" (01's `not deployed`
and `no evidence`). Fixes are dashed, features solid; the lane hue is the
chip's left edge, the same hues Atlas pins to stage names. Above it the
counts: open items per lane, then past target, on hold, reached PROD in the
last seven days, awaiting approval with how many are ready. The application
filter is the header. A chip opens the detail column: what 01 knows about the
item and the release's row from 02 (composition, highest stage, target, hold
and reason, approval, contradiction). Removed items are counted in the
application cell, not drawn.

Two board-only queries sit beside the questions in `apptrak/sql/board/`:
`stages.sql` (the sequence) and `applications.sql` (every application with a
release or an endpoint; name from `moveit.Deployment.Application` — what the
app says about itself — never from a moniker; an app that has never reported
shows by id until the registry is found, item 10). Question 01 gained a
`ReleaseId` column so the board can join its rows to 02's without a name
match.

What the fixtures made the first board show: fifteen open items across five
applications; three releases past target, two on hold, two awaiting approval
with one ready; Application 3 and Application 4 unnamed (no payload, no
registry); Team A's items at UAT and PROD by assertion only, said on every
chip; WidgetCore's Sprint 42 still at PROD under the hotfix's build (rule 5).

**Open items for this section**
- Route and name. `/moveit` is the working name; the governance reader needs a
  word they would click. Robert's.
- Whether the dashboard's top line is the twelve questions verbatim or the
  five counts above. Draft says the five; a query that is not on the board
  is still one click away.
- Refresh: live query per page load, or cached on a cadence. Draft says live;
  the question files run in milliseconds against fixtures and the real
  volume is one report per ping per endpoint. Real data 2026-09-17: 11 took
  59 seconds (item 16); 01 unmeasured. Live stays the draft until 01 is
  timed with rows in `moveit`.
- Whether "verified in VAL" gets its own column (item 5) — the event row
  exists; the board shows it if written.

## 14. The manifest loader — ratified 2026-09-17, built and fixture-verified the same day

**Why.** Part F of the morning guide was hand-typed INSERTs for one release: the
only entry path, and one that does not survive the second release. §2 and §3
already say what the record is — *build 20260910.4 of app X contains fix F and
feature G* — so the record becomes a file, and one script is the only writer of
`moveit` assertions until a form exists. Ratified as the slice after the real
run, ahead of level 2 (parked on the registry) and level 3.

**The manifest.** One JSON file per release. Fields mirror the tables; no ids
anywhere, so a manifest is portable between environments and readable by the
person who wrote it.

```json
{
  "application": 1, "release": "Sprint 44", "kind": "featureset",
  "targetDate": "2026-10-02", "note": "…",
  "workItems": [
    { "kind": "feature", "title": "Portfolio export v2", "builtBy": "dev-a",
      "externalRef": null, "includedInBuild": "20260905.2", "foundInStage": null,
      "removedAt": null, "removedNote": null,
      "links": [ { "kind": "dependsOn", "application": 1, "release": "Sprint 43",
                   "workItem": "Portfolio API v3", "note": "…" } ] }
  ],
  "builds": [ { "build": "20260905.2", "note": "Promoted to VAL" } ],
  "events": [ { "kind": "verified", "stage": "VAL", "build": "20260909.1",
                "at": "2026-09-12T15:00:00+00:00", "by": "robert", "note": null } ]
}
```

`application` is the AppTrak application id (the registry is open item 10;
until it is here, the id is what the payload carries). `includedInBuild` null
means *with the devs*. A link's `application` and `release` default to the
manifest's own; the target may live in another manifest.

**Identity — what "the same" means on a re-run.**

| Row | Key | On re-run |
|---|---|---|
| Release | (application, release name) | scalars follow the manifest |
| WorkItem | (release, title) | scalars follow the manifest; a title in the database and not in the manifest is **reported, never deleted** — removal from a release is `removedAt`, an assertion, not an absence |
| ReleaseBuild | (release, build) — the table's unique key | note follows |
| ReleaseEvent | (release, kind, stage, build, at) | inserted if absent, **never updated**: events are history; a corrected event is a new row |
| WorkItemLink | (work item, target, kind) — the table's unique key | note follows; target resolved by application + release + title in a second pass over the whole folder; unresolved is an error for that file, not the run |

**The loader.** `apptrak/Invoke-AppTrakManifests.ps1 -Path <folder or file>
[-Server] [-Database] [-By]`. Parameterised `SqlClient` throughout — manifest
text never becomes SQL text; the statements live in `apptrak/sql/manifest/*.sql`
(rule 9: a wrong write is a wrong file, fixed without touching a table). Before
any write, every kind and stage is checked against the `core.SelectItem` lists
(§10.2) and an invalid file is skipped whole. One transaction per file per
pass. Output per file: inserted / updated / unchanged per table, orphans,
unresolved links; exit 1 if any file had a problem. It never deletes, and it
never touches `health` or `core`.

*Superseded as the entry path by §15 the same evening; the loader stays as
import/export and as the reference for the write rules.*

**Where manifests live.** Real ones outside this repository — the hard
constraint (§6). The repo ships `apptrak/manifests/demo/`: two fabricated
manifests that exercise insert, no-op, cross-manifest link and a link to a
seeded item, loaded with `-By demo-manifest` and removed by the seed's cleanup.
They are **not** run by the demo runner, so the question counts the guide
quotes stand; `Invoke-AppTrakManifests.ps1 -Path manifests\demo -By
demo-manifest` after the demo adds them (01 goes from 16 rows to 20).

**Verified 2026-09-17 on the fixtures:** first load inserts; second load reports
everything unchanged and writes nothing; an edited copy updates the release
note and one item, adds one event, and reports the dropped title as an orphan;
an invalid kind rejects the file before any write; a link to a title that does
not exist is reported and the file exits 1; timestamps written with `+00:00`
read back as `+00:00`.

**Open items for this section**
- A `Key` column on `WorkItem` if titles turn out to churn. Title is the key
  today because the table has nothing else and the manifest is the record;
  a renamed title is an orphan plus a new item, and the loader says so.
- Event retraction. Today a wrong event stays beside its correction. Decide
  whether an event can be marked retracted (a column) or only annotated.
- `-By` is who ran the loader, defaulting to the Windows user; the manifest
  carries no authorship. Fine for one entrant; revisit the day a second
  person writes (with the audit pattern §10.2 parks).
- Level 3's release page should show the manifest's contents as loaded; the
  inbox (05) should name the manifest a build is missing from. Both are
  board work, not loader work.

## 15. Entry — how and where, not what (ratified 2026-09-17; built and browser-verified the same evening)

**What this section does not change.** Robert, on reading §14: *"I'm NOT changing
the overall design. It's just how to enter and where to enter."* The release is
the unit (§2), the build string is the join (§3), the ledger is observed
(§10.1), the questions are the board (§13), and §14's identity rules — never
delete, never rewrite an event, a title gone is reported — stay. What changes
is the front door.

**Why the file was wrong.** §14 asks him to author a file per release and run a
script. His words: *"I cannot do that retroactively … I was hoping that I could
have a UX that would allow me to navigate history (I would start with recent
and work backwards) and enter a few feature sets that recently had been
deployed. I also thought it would be good to set up feature sets for work that
is currently in progress."* That is §5 — the inbox prompts entry — taken
literally: the system already holds every build that ever arrived; the human
names them, on a page, recent first, stopping wherever memory stops.

**The page.** One new screen in the board, working name *History*:

1. **The ledger, newest first.** Every row of `moveit.Deployment`, per
   application, filterable by application: stage, build, when it was
   detected, machine, and whether any release claims that build. Unnamed
   builds are the inbox, drawn in place; question 05 becomes this page's
   filter rather than a separate list.
2. **Name a build.** Click a row: pick an existing release for that
   application or create one (name, feature set or hotfix, target date), then
   add lines — feature or fix, a title, who built it — with the clicked build
   filled in as where each first appeared. Save. That is §14's release,
   work-item and build writes, with the build already known.
3. **Work in progress.** The same form from a *New release* button, no build.
   Items show in the *with the developers* lane until a build carrying them
   is named from the ledger.
4. **Backwards as far as he likes.** Nothing retroactive is required; the
   board shows named releases where it can and unnamed builds where it
   cannot, and the counts strip says how many are unnamed.

Events (approved, verified, hold) are entered from the release page — level 3
— which this section makes the next screen after History rather than an
alternative to it.

**Where it runs — recommendation.** In the Census `moveit` module, beside the
board: same Razor page family, own JS tree, API endpoints that execute the
statements in `apptrak/sql/manifest/` with parameters, exactly as the loader
does. Reasons: in the deployed environment Census is hosted inside AppTrakWeb
(§13), so the write happens in AppTrak's own process; the module is opt-in on
a connection string and the rest of Census stays file-only; AppTrak's
repository is not in reach (item 11). The alternative — the form in
AppTrakWeb itself — is the right long-term home and moves with the rest of
`apptrak/` when item 11 resolves.

**What it means for Census.** Its first write to a database. Reads arrived
2026-09-14 with the board; this is the second line crossed. **Ratified
2026-09-17:** on the Census board, *"because that is where I will be using
it."* With one standing requirement, his words: **there MUST be a read-only
view for the governance reader that EVENTUALLY appears on the sidebar nav.** As
built, the lane board (`/moveit`) has no write control and History
(`/moveit/history`) has the only one; the reader's link, when the sidebar
exists, is the board and never History.

**As built.** Route `/moveit/history`, view `MoveItHistory.cshtml`, JS
`history-page.mjs` (the ledger as a table, filter chips counting unnamed
builds past DEV, *Name it* / *Add to* per row, *New release* in the header) and
`name-build-form.mjs` (pick or create the release; the release's existing
items listed, those with no build offered a *carried by this build?* tick;
new lines kind / title / built by, each with an *in build* tick; one Save).
Reads: `board/history.sql` (the ledger newest first with the claiming release
and a claim count), `board/releases.sql` (the picker), `manifest/lists.sql`
(kinds and stages for the selects and the server's check). The write:
`POST api/moveit/name-build` → `MoveItEntry`, which validates every kind and
stage against the lists, then in one transaction runs `release-upsert`,
`build-upsert` (when a build is in context), `workitem-upsert` per line, and
`workitem-attach` per ticked item — the loader's statements, plus one: attach
sets `IncludedInBuild` only where it is null, so a second build never
overwrites a first appearance. `CreatedBy` is `MoveIt:By` from settings
(`census-board` if unset; `demo-board` in the dev profile, which the seed's
cleanup removes).

**Verified 2026-09-17 in the browser on the fixtures:** the ledger renders
with 16 unnamed builds counted per application; *Name it* on a Reporting
build → new release Sprint 41 with one fix → saved: release, build and item
in the tables, every row carrying that build now reads Sprint 41; *New
release* → Sprint 45 with one feature and no build → item written with
`IncludedInBuild` null; *Add to* the same build → pick Sprint 45 → tick the
item → saved: *1 attached*, the item now carries the build and the release
claims it. Through the API: an identical re-post reports everything
unchanged; a bad release kind, an empty title, a bad item kind and a bad
stage come back as four named errors and nothing is written; attach with no
build is refused. The lane board shows the History link and counts the new
items. The demo reset removes every row the page wrote.

**The loader after this.** `Invoke-AppTrakManifests.ps1` stays as import and
export — moving a set of releases between environments, or a backup that
reads as text — and as the proven reference for the write rules. It is no
longer how anyone enters anything. §14's *"one script is the only writer"*
is withdrawn.

**Open items for this section**
- ~~Ratify the where.~~ Census module, ratified.
- **The read-only view on the sidebar nav (his requirement).** Neither the
  sidebar nor the reader's role exists yet. Until they do: the board is the
  reader's page by convention only; History is reachable by anyone who has
  the URL. Decide, when the nav is built, whether History hides behind a
  setting or a role, and whether the counts strip should name how many
  builds are unnamed.
- **Who is `CreatedBy`.** The form needs a name. AppTrak's authentication
  tables are among those missing from the local copy (item 10); until they
  arrive, a configured name in the module's settings, and the column is
  rewritten when real identity is in reach.
- ~~**Naming a DEV build.**~~ Resolved 2026-09-22: any row in the ledger can
  be named (a feature's `IncludedInBuild` is usually a DEV build), but the
  inbox is an unnamed build *past DEV*, as 05 counts it. The filter chips
  count only those and only those rows carry the inbox highlight; DEV rows
  keep *Name it* unhighlighted. Before this the count overstated the
  retrofit (16 on the fixtures, 9 real), which he noticed on real data.
- **Editing after the fact.** Retitle, pull an item (`RemovedAt`), fix a
  typo. Draft: from the release page (level 3), under §14's rules — a title
  change is a new item and an orphan the page shows, a pull is `RemovedAt`
  with a note.
- ~~Level 3 scope moves.~~ Built as §16 with events, pull and rename.

## 16. The release page — level 3 (ratified 2026-09-17 "go"; built and browser-verified the same night)

**What it is.** One release in depth, reached from a release name on History or
from *Open the release* in the board's chip detail: `/moveit/release/{id}`.
Three sections in the main column and the event form beside them.

1. **What is in it.** Every work item: kind, title, built by, the build it
   first appeared in, and where it is now — question 01's status with the
   stage hue and days there, `asserted` where the evidence is Team A's word.
   Pulled items stay in the list, struck through, with their note.
2. **Builds it claims.** Each `ReleaseBuild`, its note, and where the ledger
   says that build is *right now* (`board/release-builds.sql`: current
   `moveit.Deployment` rows for the application and build). A claimed build
   that later builds have replaced on every box reads *not on any box now*
   while its features still read PROD in section 1 — both are true: the
   build is gone, the feature was carried forward.
3. **Events.** Every `ReleaseEvent`, newest first: kind, stage, build, who,
   note. Question 02's flags (on hold with its reason, late, contradiction,
   approved for which build) sit in the subtitle, so an event recorded here
   changes the subtitle on reload — the write flows through the questions,
   not around them.

**Entry on this page.** Three writes through `MoveItEntry`, same rules as
§14 and §15:

| Action | Statement | Rule |
|---|---|---|
| Record an event (kind, stage?, build from the claimed set?, when, by whom, note) | `event-insert` | keyed (release, kind, stage, build, at); inserted or *unchanged*; never updated |
| Pull an item, with a reason | `workitem-pull` | sets `RemovedAt` and `RemovedNote` once; an item already pulled is unchanged; never deleted |
| Rename an item | `workitem-retitle` | in place, by Id; a manifest keyed on the old title reports it as an orphan, which is the loader saying so |

Kinds and stages are validated against the lists on the server; the event's
*by whom* is required (the approver, the tester — not the entrant, who is
`CreatedBy`). Pull and rename are inline in the row: the title becomes a box
with Save/Cancel, or a *why it is pulled* box with Pull/Cancel; no dialogs.

**Verified 2026-09-17 in the browser on the fixtures:** Sprint 42 for
WidgetCore renders with four items (one already pulled), two claimed builds
(neither on a box now — the hotfix replaced them, and the items still read
PROD), three events. Recorded a *hold* at PROD for `20260723.2` → row written,
the subtitle shows *on hold: Verification test hold* from question 02.
Renamed *Rate lookup cache* to *…v2* → in place, the board chip reads the
new name. Pulled *Underwriting rules v2* with a reason → struck through with
the note, the board's application cell counts *2 removed*. Through the API:
the same event again is *unchanged*; a bad kind, bad stage, missing *by* and
unparseable *at* come back as four named errors; pull and rename repeated are
*unchanged*. The chip detail's *Open the release* link points at the page.
The demo reset restores the seed rows and removes the event.

**Open items for this section**
- **Restore a pulled item.** Not offered; a pull is an assertion with a
  reason and undoing it silently would rewrite history. If it is needed, a
  *restored* note plus clearing `RemovedAt`, both visible.
- **Retract an event** (§14's open item, still open): a wrong event stays
  beside its correction. A `RetractedAt` column is the honest shape when it
  is wanted.
- **Edit an item's other fields** (kind, built by, first build) — only title
  and pull today; the rest waits for a case.
- **The reader's copy of this page.** Level 3 carries writes; when the
  read-only sidebar view exists (§15), this page needs the same split as
  History: the release in depth without the form and the row controls.

## 17. Field notes from the real environment (2026-09-21; built and fixture-verified the same day)

Robert's four notes from using the board on real data, and what each became.

1. **"Add another" blanked the release name.** Every re-render of the entry
   form rebuilt it, and only the item lines were read back first; the new
   release's Name, Kind and Target were lost. The form now reads the whole
   draft back before any re-render. Line titles were already kept; verified
   both.
2. **Remove a release, cascading — at least during stabilization.** *Delete
   release* on the release page, inline confirm naming what goes (items,
   build claims, events, links). One transaction, `release-delete.sql`:
   links touching its items from either side, events, build claims, items,
   the release. `moveit.Deployment` is observed and never touched. **This
   is the one exception to §14's "never delete"** and exists for
   stabilization: a release entered wrong is removed whole rather than
   pulled item by item. After stabilization, remove it or gate it (open item
   below). *Amended 2026-09-24 (§20):* items recorded **before the release
   existed** came in from the notebook, so the delete un-schedules them —
   back to *no release*, first build cleared, links kept — instead of
   deleting them; the confirm says how many return to Coming. Items
   recorded with or after the release were entered through it and go with
   it. Derived from `CreatedAt` on both rows; nothing new is stored.
3. **The complete picture of any feature, as shaped JSON.**
   `questions/13-feature-picture.sql`, `FOR JSON PATH`: the item, its
   application with every payload `project` reported, its release with the
   latest approval, where it is now (01's status), every stage it ever
   reached with first arrival, build and machine, the builds that carry it
   with every ledger row, the release's events, and its links both ways with
   the other side's status. Latency in days to one decimal: per stage from
   first sight and from the previous stage, entry lag, first sight to PROD,
   approval to PROD, days in the current stage. Filters, optional and
   combined: `@WorkItemId`, `@ReleaseId`, `@ApplicationId`, `@Project` (the
   application has reported that payload project — verbatim, §9), `@Stage`
   (its status now, including *with the devs*). Its CTEs are 01's location
   rule verbatim; change both together. Unlike 01, a stage reached counts
   the item's own first build even when the release does not claim it —
   otherwise the first DEV arrival, the start of every latency, goes
   missing.
4. **Only the stages seen.** AppTrak's real `stages` list carries stages
   nobody deploys to. `board/stages.sql` and every question's `stg` CTE now
   keep a list member only when a registered endpoint or a recorded event
   names it. Beyond the empty lanes this fixes a real error: 09, 10 and 12
   take the highest `Sort` as PROD and the next as pre-PROD, so an unused
   stage above PROD made every PROD answer wrong.

**Verified 2026-09-21 on the fixtures.** The seed's stage list gained LOCAL
(Sort 5) and TRAIN (Sort 40, above PROD), registered nowhere. With them in
place the filtered questions return exactly what the old questions returned
without them; the old questions with them present change answers in 02, 05
and 09. The board draws no LOCAL or TRAIN lane; UAT stays (Team A's asserted
events). In Edge: *Name it* → Name, Kind, Target and a title typed → *Add
another* twice → all kept → saved. *Delete release* on that release → the
confirm names 2 items and 1 build claim → deleted, back on History, gone.
Through the API on seeded Sprint 43: 3 items, 1 build claim, 2 events and 3
links removed (links from other releases included), ledger untouched, a
repeat reports *unchanged*, id 0 refused. Question 13: 16 items, 0.5 s;
each filter returns the expected ids; `@Project` tested with a project set
on one application's ledger rows and put back. Real-data cost unmeasured.

**Open items for this section**
- **When stabilization ends**, delete release goes away or behind a setting.
  Robert's call on when.
- **An event form stage never seen.** The event form's stage list is the
  seen list, so the first-ever assertion at a stage no endpoint registers
  (Team A's first UAT) cannot be picked from the page. The server still
  accepts any list member. Not hit yet; widen the form's list if it is.
- **13 on the board.** It is a file to run today; a per-feature page
  (level 3's work-item half, §13) would read it.

## 18. The executive view — the board, release-first (2026-09-21; built and browser-verified the same day)

Robert, 2026-09-21: *"I do like the 'where is it' board. But it needs
improvement. It should be the basis for executive view."* The board item by
item answers the governance reader; an executive asks per release: is it
shipped, is it late, is it stuck, is it waiting on us or on the client.

**What changed.** `/moveit` opens on **Releases**; **Features and fixes**
(the §13 lanes, unchanged) is one toggle away, and `?view=items` links there.
Same lanes, same application filter, same read-only rule.

- **One card per release** in the lane of its highest stage (02). The card
  shows what is in it (features, fixes), how long it has been at that stage,
  the target date, and — when its items are spread out — a bar of its items
  by lane (01), so "half in VAL, one fix still with the devs" reads at a
  glance.
- **Flags an executive acts on:** late; on hold with the reason (shortened on
  the card, full in the detail column); *ready for client approval* or
  *waiting on a dependency* (04, with the blockers); *approved, not yet
  deployed*; the hotfix contradiction.
- **Shipped folds away.** A release wholly in the top stage for more than
  `MoveIt:ShippedDays` (default 14) leaves the lanes and is listed under its
  application as *Shipped: name, date*, still clickable. Abandoned releases
  are counted there. Without this the PROD lane grows forever.
- **The strip** counts releases in flight per lane, then late, on hold,
  awaiting client approval (how many are ready), approved but not deployed,
  shipped within the window. The items view keeps its own counts.
- **Detail column:** the release's flags, stage and since, target, approval,
  what is waiting on, and every item with its stage. *Open the release*
  links to level 3.

No new SQL: 01, 02 and 04 already return all of it.

**Verified 2026-09-21 in Edge on the fixtures:** five cards in flight
(Sprint 43 at DEV after its rollback, on hold, late, approved and not
deployed; Ledger cleanup built and not seen, late; Q4 statements ready for
approval; Q4 letters waiting on a dependency; Reporting refresh), five
releases folded as shipped; strip 0/1/1/3/0 in flight, 3 late, 2 on hold, 2
awaiting approval with 1 ready, 2 approved but not deployed; the toggle
switches to the 15 item chips and back, and the URL follows; the
Application 4 filter shows its two cards.

**Open items for this section**
- **Is this the executive's page, or does the executive get a page of their
  own?** Built as the board's default view because Robert called the board the
  basis. If an executive needs less (no lanes: just the strip and a list of
  flagged releases), that is a third view over the same data.
- **The detail column links to the release page, which has write
  controls.** Same issue as §16's open item; the reader's copy is owed
  before the sidebar link is.
- **Team** as a second filter still waits on the registry (item 10).

## 19. Division — the executive's tab (2026-09-21; built and browser-verified the same day)

Robert, 2026-09-21: *"The executive view is going to be a new navigational
tab … very, very easy for an executive to understand where things are in the
process … a step line approach where each step is a stage. Some strong visual
that indicates where things are per project and feature within that project
… make them understand that they know what's going on in their whole
division."* Supersedes §18 as *the* executive view; §18's release cards stay
on the board as the governance reader's release view.

**Navigation.** Move It gains a tab bar across its pages — **Division** ·
Where is it · History (`tabs.mjs`); the release page shows it with no tab
active. Route `/moveit/division`, view `MoveItDivision.cshtml`, JS
`division-page.mjs`. Read-only: no write control, and no link to the release
page (which has them).

**The page.**

1. **Six numbers**, large: releases on the way (and how many features and
   fixes they carry), went live within the shipped window, waiting on client
   sign-off, signed off and going live, past target, on hold.
2. **One set of steps across the top**, numbered, each with a plain-words
   caption: *In development* (with the developers — §13's first two lanes
   merged, because an executive does not distinguish them), one step per
   stage lane before the top (DEV, VAL / UAT), **Client sign-off**, then the
   top stage (PROD, *live*). Captions are a setting
   (`MoveIt:StepCaptions`, keyed by stage identifier).
3. **Per project** (application; named ones first), each release as a thick
   step line: ticked nodes behind it, a large ringed node where it is, faint
   nodes ahead, and a caption under the current node — *being built*,
   *built, not yet on a server*, *in testing · 14 days*, *waiting on the
   client*, *signed off, going live*, *on hold · 32 days*, *live since Aug
   4*. Late, on hold with the reason, and hotfix sit beside the name. Under
   each release, every feature and fix as a thin line on the same columns, so
   the pieces read straight down under their release. Click a release name
   to fold its items. In-flight releases first, then recently live ones.
   Older shipped releases fold into the project header ("earlier: Sprint 42
   live Aug 4"), using the same `MoveIt:ShippedDays`.

**The sign-off step is derived, never stored** (rule 1 holds). A release at
the last testing stage sits *at* sign-off when an `approved` event exists
(signed off) or a `verified` event exists (testing done, waiting on the
client); with neither it is still *in testing*. This is §2's "ours versus
theirs" line, drawn. A release that went live with **no approval recorded**
shows **!** at sign-off instead of a tick, and says so beside its name —
question 12's finding, where an executive will see it.

Colours: step hues are the stage hues (§13); amber means held, blue means
waiting on the client, green means live.

**Verified 2026-09-21 in Edge on the fixtures**, at the default 14-day window
and at 60 days (`MoveIt__ShippedDays=60`) so the live rendering showed:
Reporting refresh on hold at sign-off, 55 days; WidgetCore Sprint 43 on hold
at DEV after its rollback, with one fix still at *In development*; Ledger
cleanup built, not yet on a server; Team A's Q4 releases in testing at
VAL / UAT; five releases live, WidgetPortal Sprint 42 marked *went live with
no client sign-off recorded*; unnamed applications last.

**Open items for this section**
- **Is this the executive's only page?** A sidebar link to it is the
  standing requirement (§15); Division is the natural first entry.
- **The read-only gate is deferred until development is complete** (Robert,
  2026-09-21: *"I am the executive until all development is complete so no
  worries about anybody else seeing anything"*). History, the release page
  and Delete release stay reachable by URL until then; the gate (a setting,
  or a role once AppTrak's auth tables are here) is due before anyone else
  gets a link, not before.
- **Team as a grouping above projects** — "their whole division" may mean
  two teams. Waits on the registry (item 10).
- **Nothing shipped in 14 days on the fixtures**, so at the default the page
  shows no live rows. Real data will decide whether 14 is right.
- **"Verified" moves a release to sign-off.** If the teams never record
  `verified`, releases sit at *in testing* until approval. Whether to record
  it is item 5.

## 20. Coming — what is heard before it is built (ratified 2026-09-24 "it's a go")

Robert, 2026-09-24, thinking as the product owner over teams he does not
control: *"instead of keeping a text document somewhere that keeps track of
numerous upcoming feature and work efforts, I just want a little place to
keep the knowledge I gain from sitting in meetings and then be able to use
that as a resource to kind of know what's going on."* And, asked whether
this makes Move It a work tracker: *"No, we're not becoming Jira."*

**What it is.** A witness log, not a work tracker. One entrant writes what
was said in a meeting — this feature is coming to that application — and
the estate confirms or contradicts it later. It is the step before
`deployed-asserted` (rule 6): declared intent, with provenance in the note,
never counted as anything until a build carrying it is named from the
ledger. The text document never finds out it was right; this does.

**What it is not.** No assignee, no estimate, no priority, no status anyone
must maintain. The item is a statement of intent — application, title,
feature or fix, a note saying where it was heard — and nothing else. Priority
will be the first thing asked for; a note carries it fine, and the day it is
a column the notebook has a chore in it. If a team needs ranking, that is
their tool. Nor is everything heard in a meeting a feature of an
application: "that app is being retired" or "the DMZ is moving" is estate
knowledge and stays out, or this becomes the text document again.

**The shape — two columns, no new table.**

- `moveit.WorkItem.ReleaseId` becomes **nullable**. An item with an
  application and no release is the notebook; nothing is stored to say so.
- `moveit.WorkItem.ApplicationId` is **added**, `NOT NULL`, because an item
  with no release has no other way to know its application. Existing rows
  take it from their release; 002 does the migration in place and stays
  idempotent. Every question that read the application through the release
  now reads it from the item; the ones that inner-join the release (02, 03,
  04, 09, 10) keep doing so, since an item with no release has no builds,
  no stage and no events to contribute.
- The note goes in `Description`, the column §10.2 already had and nothing
  wrote. *"Tuesday sync, per the WidgetCore lead; Q4 maybe."*
- **Rough timing is a release with a name and no date.** "Q4 2026" or "after
  the mainframe freeze" is a valid release name; `TargetDate` was already
  nullable. No fuzzy-date column.

**Where it shows.** Question 01 gains a status, **`no release`**, ahead of
*with the devs*. The board's first lane, *With the developers*, becomes
**Coming** and holds both: heard about, or scheduled and not yet in a build.
The chip says which — the release name, or *no release yet* — and how long
it has sat there, because for both pre-build statuses 01 now returns `Since`
as the day the item was recorded (first arrival at *Coming*; before this it
was null for *with the devs*). Heard in June and still nothing by December
is the finding a text document never raises. When a build carrying the item
is named on History, the chip walks right on its own. Division is untouched:
it draws releases and their items, and a no-release item belongs to none.
The release view of the board likewise; the items view is where the
notebook lives. Question 13 gains the same status and `@Stage = 'no
release'`; its `release.*` and `events` come back null and empty for such an
item, which is the honest picture.

**Two ways in.**

1. **On the board, in the items view: *Coming up*.** One line above the
   lanes — application, feature or fix, title, note — and *Add*. The chip
   appears in Coming on save. `POST api/moveit/add-item` → `MoveItEntry` →
   `manifest/workitem-add.sql`, keyed on (application, title) among
   no-release items: inserted or *unchanged*, never updated. **This is the
   board's first write control.** §15 ratified the board as the page with
   none; the standing requirement — a read-only view for the governance
   reader — is unchanged and now covers this box the same way it covers the
   release page's forms: behind the deferred gate (§19), not before anyone
   else has a link. Named as an open item below rather than buried.
2. **On History, in the entry form: the pick list.** Under the chosen or new
   release, the application's no-release items are listed — *Coming, not in
   any release* — each with a tick. Ticked items are scheduled into the
   release (`manifest/workitem-schedule.sql`: sets `ReleaseId` where it is
   null, once; *scheduled* or *unchanged*). With a build in context the tick
   reads *in this release, carried by this build* and the item is also
   attached (§15's `workitem-attach`), because naming a build is the moment
   the heard thing became real. This is the "pick list of features" from the
   conversation: the notebook feeds the release, on the page where releases
   are named.

**Rules that hold.** Never delete (a heard item that never happens stays,
and can be pulled with a reason like any other — *the client dropped it*).
`workitem-upsert` now takes the application so the loader and the form write
the same row; a manifest still keys on (release, title). `build-upsert`
treats a null note as *leave it alone* (2026-09-24): the form has no note
field and was erasing a build's note on every *Add to*; a manifest clears a
note with `''`. Rule 5 is
untouched: a no-release item holds no build and reaches no stage.
`release-delete` (§17, stabilization) still removes the release's items
whole, including ones scheduled into it from the notebook — see open items.

**Slippage is not tracked.** An item moved from one release to another, or
a target date moved, rewrites the plan with no trace. With one entrant the
note carries the story; if a case for a move record ever arrives, the note
history is where it will come from.

**Built and verified 2026-09-24 on the fixtures — through the API, then
seen in headless Edge.** The session was remote and the browser extension
was not connected, so the writes were exercised over HTTP and the pages
then rendered with `msedge --headless --screenshot`: the board's items view
(Coming first, three *no release yet* chips with their days, *4 Coming* in
the strip, the *Coming up* line above the lanes), History unchanged, and a
throwaway page that mounted the chip detail (Where *no release*, Heard,
Note) and the entry form for `20260820.4` on Sprint 43 with *Batch re-rate*
offered under *Coming, not in any release*. Clicks were not exercised in a
browser; the same actions were exercised through the API. What was proven: 002 migrated the existing `WorkItem` in
place (`ApplicationId` filled from the release and made `NOT NULL`,
`ReleaseId` made nullable, a second run silent); the seed carries three
heard items (WidgetCore *Batch re-rate* since day 20, WidgetPortal *Session
drop on tab switch*, Reporting *Scheduled exports to SFTP*); 01 returns
them as `no release` with `Since` the recorded day, and every other
question runs unchanged (05's inbox, 03's violations, 04's two candidates
as before); 13 returns them with the note, null `release.*`, empty
`events`, and `@Stage = 'no release'` works. Through the API: the same
heard item again is *unchanged*; a new one is *inserted* and reads `no
release` with its note; a bad kind, an empty title and no application come
back as named errors; scheduling a heard item into a new dateless release
*Q4 2026* reports *1 scheduled* and the item reads *with the devs* in that
release; scheduling one into Sprint 43 while naming `20260820.4` reports *1
scheduled, 1 attached* and the item reads DEV under that build; the same
call again is all *unchanged*. The demo reset restored the seed. *Later the
same day, through the API:* *Add to* on a claimed build with no note
reports the build *unchanged* and its note stands; a scratch release with
one heard item scheduled in and one item typed through it, deleted —
*1 reverted, 1 item, 1 build claim* — and the heard item reads *no release*
with no build; the seed's recorded days are pinned (the with-the-devs item
on day 50), so "days here" no longer reads *today*.

**Open items for this section**
- **The board now carries a write.** Gate it with the rest (§19's deferred
  gate) before anyone but Robert has the link. Until then the convention
  from §15 — the board is the reader's page — is weaker by one box.
- ~~**Delete release drops scheduled notebook items with it.**~~ Resolved
  2026-09-24: items older than the release return to Coming (§17 item 2,
  amended).
- **Estate-level hearsay** — retirements, moves, freezes — has no home here
  by design. If it wants one, it is a separate question, not a work item.
- **Moving an item between releases** is not offered. A pull with a note and
  a fresh entry is the honest path today; a schedule that changes a non-null
  `ReleaseId` waits for a case.
- **Sort of undated releases** on any future time view: dated first, undated
  in a *someday* column. Not built; the lane board has no time axis.
  *§21's calendar is the first time view:* an undated release simply draws
  no flag there; its arrivals and events still show.

## 21. Calendar — when things moved, and when they were due (spec 2026-10-01 "go"; built and browser-verified the same day)

Robert, 2026-10-01, after clicking through Division, Where is it and History
on real data: *"a Calendar view might be very useful. one where we can
select [All] followed by stages, and then another filter of the systems."*
Systems are applications — *"not machines, not teams."*

**The question it answers.** Division says where each release is, Where is
it says what is at each stage, History is the ledger. None says **when** —
what landed this week, what is due next week, whether things land when they
were meant to. The calendar is the first view with time across the page,
and it holds the past (observed, asserted) and the future (planned) on one
grid.

**Three kinds of date, drawn three ways.** Rule 1 holds: what the estate
saw and what people said are never drawn alike.

| Kind | Source | Drawn |
|---|---|---|
| Observed — a build first reached a stage | `moveit.Deployment.DetectedAt` | solid chip, stage hue |
| Asserted — approved, verified, hold, resumed, abandoned, deployed-asserted | `moveit.ReleaseEvent.At` | outlined chip |
| Planned — a release's target | `moveit.Release.TargetDate` | hollow flag; red when the day has passed and the release is not in the top stage |

Not drawn: `note` events (noise) and Coming items (§20 — the notebook
carries no dates, and giving it some is the road to Jira). An undated
release draws no flag.

**The unit is one chip per application, stage and day.** A `Deployment`
row is per machine, and under *All* DEV would bury the rest. A chip is the
first arrival of a build at a stage, collapsed per application, stage and
day: *WidgetCore → VAL · Sprint 43*, or *→ DEV · 3 builds* when several
landed. A build no release claims reads *unnamed build*, greyed. A build
returning to a stage it had left is marked ↺, by 08's rule.

**Filters.** Stage: **[All]** then one button per stage from
`board/stages.sql` (seen stages only, §17 item 4), one at a time. Events
with no stage (hold, resumed, abandoned when unstaged) show under *All*
only. Systems: the board's application filter. Both filter in the browser
over a month fetched once, so switching is instant.

**The page.** A fourth tab — Division · Where is it · History ·
**Calendar** — route `/moveit/calendar`. Month grid, prev/next month, today
marked. A day shows up to three chips then *+N more*. Clicking a day opens a
side column with every entry: application, release (or build string),
stage, build, who and when for assertions, the reason for a hold. Hues from
`stage-hues.mjs`, so a chip matches its Division step. **Read-only, and no
link to the release page** (Robert, 2026-10-01: *"not now"* — same reason as
Division, §19; revisit with the gate).

**"Last change recorded."** There is no SQL Agent on the real server (item 17);
the ledger knows only as far as the last manual backfill. The page states
**Last change recorded *date*** (the latest `DetectedAt`) and hatches the
days after it up to today, saying they are *either quiet or not yet
backfilled*. It cannot say which: the ledger records changes, not when the
backfill last looked (open item below). Without the line the grid reads
complete when it is not.

**The query, as built.** `board/calendar.sql`, no parameters — every
dated row once, and the page pages by month in the browser (the other board
files run verbatim the same way; the spec's `@From` / `@To` was dropped for
that). One result set, `Kind` = `arrived` | `returned` | `event` |
`recorded-through`:
- **arrived** — a build's first row at a stage (any endpoint there). **Not
  drawn when that first row is the endpoint's first ping** (`PreviousId` is
  null): the build was already there when watching began, so it did not
  arrive that day. Without this the window's first day is crowded with
  arrivals that never happened.
- **returned** — 08's rollback rule, one row per server; the page collapses
  servers into one chip and one line (*· 2 servers*).
- **event** — every `ReleaseEvent` but `note`, with the release.
- **recorded-through** — one row, `MAX(DetectedAt)`.

Planned flags come from 02 (`TargetDate`, `PastTarget`, `HighestStage`),
which the page already reads; an abandoned release draws none. Endpoint
`GET api/moveit/calendar`; page `calendar-page.mjs`, view
`MoveItCalendar.cshtml`. Days are the **reader's** local day (the browser's
clock); weeks start Monday. Real-data cost unmeasured.

**Calls (logged in `calls-made-for-you.md`, 2026-10-01).** `DetectedAt`,
not `Deploymentat` — ours over the pipeline's claim (§10.1); the lag of one
ping interval vanishes at day grain. Days are the reader's local date, not
UTC. Holds are points, not spans. Chip order in a day: targets (missed
first), rollbacks, arrivals from the top stage down, then events; three
shown, then *+N more*.

**Verified 2026-10-01 in Chrome on the fixtures** (the seed runs Jul 6 –
Sep 14 UTC, read in US Eastern, so midnight-UTC arrivals land the evening
before). August, All: Reporting refresh *due* red on Aug 24 with its PROD
arrival the same day and ↺ *back to 20260701.1* on Aug 26; WidgetCore ↺
*back to 20260815.1* on Aug 30; Q3 rate changes *due* grey on Aug 25 (live
by assertion); WidgetCore Sprint 43 *due* red on Sep 1; days from Sep 2
hatched under *Last change recorded Tue, Sep 1*. PROD + WidgetCore: only
Aug 29 (arrival and approval), Aug 30 (rollback), Aug 31 (on hold), Sep 1
(due). Aug 30's column: one rollback line, *2 servers*. *This month*:
October, Oct 1 marked today, Q4 letters *due* red on Sep 29, Sep 28 – Oct 1
hatched, scroll back at the top. Not seen: the narrow-screen layout.

### 21.1 The backfill stamps its run, and holds become spans (Robert, 2026-10-01: "do the backfill run stamp … just go with your lean"; built and browser-verified the same day)

**`moveit.BackfillRun`** (in `001`, idempotent): one row per backfill run —
`RanAt`, `RanBy` (`suser_sname()`), `ThroughAt`, `Inserted`. The backfill
fixes `@through` = the latest qualifying ping's `StartAt` **before** it
reads, considers only pings up to it (later ones wait for the next run,
which picks them up — the rule is unchanged, the window is closed), and
writes the row at the end only when the table exists, so a backfill run
before the new `001` still works. Its printed line now ends *looked through
…*. The calendar reads the latest run: banner **Recorded through *date***,
*the backfill last ran … (who)*; hatched days are *not yet backfilled*, and
an empty day before the line **was quiet** — the ambiguity is gone. With no
run recorded (or no table) it falls back to *Last change recorded* and the
old wording. `calendar.sql` guards the table with `OBJECT_ID`, so the page
works on a server where 001 has not been re-run. When the live processor
(Part E) writes rows as pings arrive, it should stamp the same table, or the
banner goes stale.

**Hold spans.** A hold runs from its day to the release's next `resumed` or
`abandoned`; one never lifted runs through today (02's on-hold rule). Each
held day carries a thin amber band at the foot of the cell, not counted
against the three chips, named (*Reporting · Reporting refresh on hold*)
where it starts and on each Monday; the stage filter treats it like its
hold event. The day column gains an **On hold** section: *since Aug 27, 35
days so far* or *from Jul 22 for 6 days, then resumed*, with the reason.

**Verified 2026-10-01 in Chrome on the fixtures.** Demo rebuilt: 001 made
`BackfillRun`, the backfill inserted 39 and stamped through Sep 13 23:50
UTC; a second run inserted 0 and stamped again. Every question and board
file runs. `calendar.sql` run before the table existed: same 43 rows, the
*last change* fallback. September: *Recorded through Sun, Sep 13 … backfill
last ran Thu, Oct 1 (…)*; Sep 2 – 13 no longer hatched, Sep 14 onward
hatched; Reporting refresh and WidgetCore Sprint 43 bands from Aug 27 and
Aug 31 running through the month, named on Mondays; Sep 5's column lists
both with reasons and day counts. A scratch hold (Jul 22) and resume (Jul
28) on WidgetPortal Sprint 42: band Jul 22 – 27, column *from Jul 22 for 6
days, then resumed*; then removed (18 events, as seeded).

**Rulings taken on Robert's word "go with your lean" (2026-10-01).** Week
view, agenda list for narrow screens, several stages at once: **deferred**
until the month grid has been used on real data. Link from the day column
to the release page: **after the gate**. Builds already there at an
endpoint's first ping: **not drawn**. A redeploy of the same build without
leaving the stage: **drawn once**, no fourth marker.

**Open items for this section**
- **The live processor (Part E) stamps `BackfillRun`** — or the calendar
  reads its own watermark — when it lands.
- **Revisit the deferred views** after a few weeks of real use.
- **Already there when watching began** — if an endpoint is registered the
  day its app first deploys, that real arrival is lost. Not hit yet.

## 22. The fixture check — every rule pinned to its answer (2026-10-01, Robert: "go")

Each question carries a rule argued for and verified once by hand; an edit can
change an answer without an error. `tests/Test-MoveItQuestions.ps1` rebuilds the
local demo database through `Invoke-AppTrakDemo.ps1` (or reuses it with
`-SkipRebuild`) and asserts what the seed was built to produce, each assertion
named by the rule it proves: the backfill's second run inserts nothing and stamps
its run through the last seeded ping; only seen stages; 01's location rule item by
item (rollbacks move Sprint 43 to DEV and Reporting refresh to VAL, asserted moves
stay asserted, heard items read *no release*); 02's stage and hold per release;
03's violations by title (link ids change on every reseed); 04 ready and blocked;
05's inbox by kind; 06's lying endpoint; 07 current and historical; 08's rollbacks
and variants; 09–12; 13 parses as one JSON document of every item; the calendar's
first-ping rule, rollback rows, no notes, and its stamp. Pass/fail in the style
of the collector tests, exit 1 on any failure. **Never against the real server**:
the rebuild deletes and reseeds demo rows.

Nothing time-relative is asserted (days ago, days in stage); `PastTarget` is
stable because every seeded target is now past.

**Verified 2026-10-01:** 25 passed after a full rebuild. With 08's `<` changed to
`<=` the rollback assertion failed — a machine move counted as a rollback — and
passed again once restored.

**Open items for this section**
- **Run it before every push** — a habit, not a hook, until there is a reason for
  more.

## 23. Needs a word from you — the entrant's list (2026-10-01, Robert: "go"; built and browser-verified the same day)

Everything people record — approved, verified, on hold, the notebook — exists only if
it is entered. Two weeks away and Division is calm and wrong. This list says what has
not been said yet. **Derived, never stored**: built in the page (`needs-a-word.mjs`)
from answers History now loads — 01, 02, the event list, 12, and the ledger's inbox
rule — so no rule is written twice; a line goes away when the entry it asks for is
made. No dismiss, because dismissing would be a stored state.

**Where:** the top of **History**, the entrant's page, collapsible, following the
application filter. Not on Division: the executive sees the board, not the entrant's
debt.

**The lines, one per release (reasons joined) or item or application:**
- **past its target with no hold saying why** — 02 `PastTarget`, not on hold.
- **at *stage* N days with nothing recorded** — in flight (below the top stage, not
  abandoned, not on hold), at its highest stage longer than `MoveIt:StaleDays`
  (default 14), and no event on the release within that window.
- **went live with no approval recorded** — 12's *PROD without approval*.
- **heard N days ago and still in no release — still coming?** — 01 `no release`
  older than `MoveIt:ComingDays` (default 60).
- **N builds past DEV nobody has named** — History's inbox rule (05's), per
  application, distinct builds.

**Verified 2026-10-01 in Chrome on the fixtures:** 8 lines — WidgetPortal Sprint 42
live unapproved; Ledger cleanup past target (Aug 15); Q4 statements and Q4 letters
past target *and* at UAT 25 / 22 days quiet; Batch re-rate heard 67 days ago; one
unnamed pre-window build each for WidgetCore, WidgetPortal and Reporting. The two
held releases (WidgetCore Sprint 43, Reporting refresh) are rightly absent.

**Open items for this section**
- **A count on the tab** (History *(8)*) would pull you to it from any page; not
  built — it costs every page three more queries.
- **Thresholds per application** if one team's cadence makes 14 days noisy.

## 24. Division says what it cannot see (2026-10-01, Robert: "go"; built and browser-verified the same day)

A tidy Division reads as complete. It is not: Team A's AWS applications move only by
assertion, and some applications send no deployment block. Division now states it.

- **The coverage line**, under the six numbers: *The pings watch **3 of 5**
  applications · **1** known only from what people record (Application 4) · **1** not
  visible: no deployment details reach the board (Application 3)*. Amber when anything
  is less than watched. Named, because "1 not visible" invites "which?".
- **A tag on each project header**: *recorded by hand* (asserted only) or *not
  visible* (pinged with no block, or nothing). Watched projects carry no tag.
- **Source: `board/coverage.sql`** — question 11's verdict rule verbatim, without 11's
  last-good-ping lookup over `health.HealthReport`, the part that took 59 s on real
  data (item 16). The verdict never used it. Change the two together; the fixture
  check (§22) asserts they agree.

**Verified 2026-10-01 in Chrome on the fixtures:** the line reads 3 of 5, Application 4
by hand, Application 3 not visible; the tags sit on those two project headers; the
fixture check passes 26 with the new agreement assertion.

**Open items for this section**
- **Endpoint-level coverage** — an application observed at PROD but blind at DEV
  counts as watched. Good enough for the executive; 11's second result set has the
  detail.

## Appendix A — questions the data could answer

Compiled across the session; the value proposition in list form.

**The governance reader**
- Where is feature X right now? Where is everything?
- What reached PROD this week / month? What is in VAL waiting, and how long has
  it sat? What is still with the devs?
- What is past its target date and not in PROD? What shipped for app Y?
- Features vs fixes shipped. Claimed phase vs observed stage (drift).
- "Done, waiting on the client" vs "still being tested" — the interval that is
  ours vs the interval that is theirs.

**The architect**
- Lead time DEV → VAL → PROD per app, team, release, kind.
- How many VAL round-trips a release took (distinct builds seen in VAL).
- Which fixes exist *because of* VAL testing (appended after first promotion).
- What landed in DEV after the promoted build and so was cut (partial
  promotion is normal under the stagger).
- Which build runs in each stage of app A now; are stages on different builds.
- Did a build skip a stage? Go backwards (rollback, seen within ten minutes)?
- Deploy downtime: gap between last healthy ping on build N and first on N+1.
- Time of day deploys happen, per team.
- Did anything reach PROD without an approval record? Is the PROD build the
  approved build?
- Did a VAL build sit idle for weeks with no approval — stalled or forgotten?
- Cross-app releases (one work item, several apps) — the risky ones.
- Pipeline-asserted stage vs Census-asserted stage disagreement.

**Triage / process health**
- Builds in PROD with no manifest attached — process debt, the one number that
  says whether the manual habit holds.
- Entry latency: how long after a build first appears does its manifest get
  attached, per team.
- Apps giving no build evidence at all — the regime rollout tracker.
- Servers in one stage disagreeing on build.
- Builds seen and superseded before anything was attached.
- Who attached a manifest; was it later amended.

**The developer**
- Did my build land in DEV yet? Which of my items are in the current VAL
  build? What else rides in the same build as my fix?

**What none of the sketched data answers**
- Who deployed it and was it approved (now: the approval event).
- Which machine it landed on (now: Census's join).
- Is PROD healthy after the deploy (the tracking site has it; link it).
- Why it stalled — no blocker/reason field anywhere yet.
- Which database schema changes rode with the build.
