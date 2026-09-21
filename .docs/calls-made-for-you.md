# Calls made for you

Non-pivotal decisions made without stopping, per the collaboration contract ("make your
best guess and proceed, period"). Newest first. Each entry: the question, the options, the
call, the reason. Reverse any of them by saying so.

## 2026-09-21 — Division, the executive's tab (move-it.md §19)

**Name and place: "Division", first tab, `/moveit/division`.** Your word ("their whole
division"). Tabs across the Move It pages, since Census has no site-wide nav yet.

**Client sign-off is its own step between the last testing stage and PROD.** Reason: it is
the step executives ask about and the only one that leaves nothing on a server; without it
the line jumps from "testing" to "live".

**"With the developers" and "built, not seen" merge into one step, "In development".**
Reason: an executive does not care about that difference; the caption under the node still
says which.

**A release reaches sign-off on `verified` (waiting on the client) or `approved`.** Reason:
§2's "done, waiting on the client" versus "still being tested" is the distinction you said
matters most; `verified` is the only record of the first.

**Live without an approval shows "!" at sign-off**, not a tick. Reason: ticking a step that
never happened would be the page lying; question 12 already calls it a finding.

**Features expanded by default**, folded by clicking the release. Reason: you asked for per
feature within project.

**Step captions are a setting** (`MoveIt:StepCaptions`). Reason: your rule for doubtful
display values; "validation testing" may not be what your teams call VAL.

**The board keeps §18's release view.** Division is for executives; the board's release view
is still useful to you. Say so if you want the board back to items-first.

## 2026-09-21 — the executive view (move-it.md §18)

**Improve the board rather than build a separate executive page.** Options: a new page;
the board with a release view. Call: the board, releases as the default view, the item
lanes a toggle away. Reason: your words, "it should be the basis"; one page and one set of
lanes means one thing to maintain and nothing to disagree.

**Release-first is the default.** Reason: executives ask about releases; an item chip
answers a developer's question. The old view is `?view=items`.

**Shipped releases fold after 14 days, as a setting** (`MoveIt:ShippedDays`). Reason: a
number you may want to tune, so per your rule it is a setting.

**"Ready for client approval" and "approved, not yet deployed" get their own blue flag.**
Reason: they are the waiting-on-the-client states §2 says the reader most wants to see;
red means us, amber means held, blue means the ball is with someone else.

## 2026-09-21 — field notes (move-it.md §17)

**"Seen" means a registered endpoint or a recorded event names the stage.** Options:
stages in `moveit.Deployment` only (strictly observed); endpoints registered; endpoints plus
events. Call: endpoints plus events. Reason: on real data only DEV has deployments today, so
"observed only" would leave one lane and hide every VAL/UAT/PROD endpoint still waiting on
its block; events keep Team A's asserted UAT.

**The filter goes into every question's `stg`, not only the board's lanes.** Reason: 09, 10
and 12 take the highest `Sort` as PROD; an unused stage above PROD broke them silently. One
rule in ten places, all the same two lines.

**Delete is a hard delete, not a `VoidedAt`.** Reason: you asked for removal during
stabilization, i.e. undoing entry mistakes; a voided row would still be in every question's
way. No setting to turn it off yet: when stabilization ends is yours, and it is a two-line
removal or a gate then.

**Question 13 is a file, not a board endpoint.** You asked for a T-SQL query; putting it on
a page is §13's level-3 work-item half, not asked for yet. Placed in `questions/` so the
runner smoke-tests it.

**Latency in days with one decimal, from minutes.** Reason: pings are ten minutes apart, so
whole days hide same-day promotions and hours overstate precision.

**`@Stage` filters on where the item is now**, not on stages it ever reached. Reason: "show
me what is in VAL" is the weekly-meeting question; the reached stages are in the document.

## 2026-09-18 — the daily backfill job

**CmdExec over the file, not a T-SQL step with the SQL pasted in.** Options: paste the
backfill body into the job step (self-contained, nothing to deploy to the server); run
`sqlcmd -i` over `backfill-deployment.sql` (one copy of the rule, file must be on the box).
Call: the file. Reason: Part E's two-producer test only means something while there is one
copy of the rule; a pasted copy drifts the first time the file changes. `-v ScriptPath`
covers wherever the file lands on the real server.

**Daily at 06:00, owner is whoever runs the script.** Reason: before the working day, and
CmdExec without a proxy needs a sysadmin owner, which the person running it is.

**Not verified end to end.** The create script ran clean locally and the stored job, step,
schedule and command were inspected; the job itself was not executed because the local
Agent service could not be started without elevation and Robert ruled the job must not
run on the dev machine. The local copy was deleted. First real run is the verification.

## 2026-09-17 — the release page (§16)

**Rename edits the title in place.** §14 keyed manifests on title and treated a rename as an
orphan plus a new item. Options: the same on the page (pull the old, add the new); update
by Id. Call: update by Id. Reason: on the page the item's identity is its Id and a typo fix
is what the user means; the loader still reports the orphan against an old manifest, which
is the right side to be loud on.

**Pull needs a reason, and there is no restore.** Reason: `RemovedAt`/`RemovedNote` is an
assertion; a silent undo would rewrite history. Open item in §16 if restore is wanted.

**Events form: build is a select of the release's claimed builds, not free text.** Reason:
an event about a build the release does not claim is almost always a typo; claiming the
build first (History, *Add to*) is one click. Free text can be added if a real case appears.

**"By whom" is required and separate from `CreatedBy`.** Reason: the approver or tester is
the fact; the entrant is provenance.

**Events listed newest first, like History.** Reason: the reader arrives asking what
happened last.

**"Not on any box now" for a claimed build the ledger no longer sees.** Options: hide such
builds; word it as superseded. Call: show, with that wording, beside items that still read
PROD. Reason: both facts are true and the page should not pick one.

## 2026-09-17 — the History page (§15)

**History is its own route, the board unchanged.** Options: a mode switch on `/moveit`; a
second page. Call: `/moveit/history`, linked from the board's header. Reason: his standing
requirement that the reader's view be read-only — a page with no write control on it is
the simplest proof, and the sidebar link, when it exists, points at the board.

**Attach sets a first appearance once.** `workitem-attach.sql` writes `IncludedInBuild` only
where it is null. Reason: the column means *first* build; a later build on the same item is
a move or a rollback, which the ledger observes.

**`CreatedBy` is a setting (`MoveIt:By`), default `census-board`, `demo-board` in dev.**
AppTrak's identity tables are not here (item 10). Reason: one entrant today; the seed's
cleanup keys on the dev value so the fixtures reset clean.

**Existing items of a release shown in the form, with a tick only for those with no build.**
Reason: this is the flow he described — set up work in progress, later attach it from the
ledger — and an item that already has a build must not be re-pointed by a tick.

**Naming a build claims it for the release (`ReleaseBuild`) even with no new lines.**
Reason: "this release was in that build" is the manifest's minimum record (§3); lines are
optional detail. A build claimed by two releases shows both on the ledger (`+1`).

**Kinds and stages come from the SelectItem lists at render and again at save.** Reason: the
form never hardcodes a list AppTrak owns; the server check is the boundary.

## 2026-09-17 — the manifest loader (§14)

**Title is the work item's key.** The table has no key column. Options: add `Key` (DDL);
use `ExternalRef` (Team A only); use `Title`. Call: title, with orphans reported and never
deleted. Reason: the manifest is the record and the person who wrote it is the one reading
the report; a renamed title costs one visible line. Open item in §14 if titles churn.

**Events are never updated.** Key (kind, stage, build, at); a corrected event is a new row.
Reason: events are history; the alternative makes a manifest edit rewrite the past silently.

**JSON timestamps stored as the instant, in UTC, when the parser eats the string.**
`ConvertFrom-Json` in pwsh 7 turns ISO 8601 strings into local `DateTime`s before the loader
sees them. Options: require pwsh 7.5's `-DateKind`; convert what arrives. Call: convert —
a `DateTime` is taken as the instant it names and written `+00:00`. Reason: no version
floor added for a cosmetic offset; the instant is what every question compares.

**`-By` defaults to the Windows user name.** The manifest carries no authorship. Reason:
one entrant today; the audit pattern is parked in §10.2 for the day there are two.

**The demo runner does not load the demo manifests.** Reason: the guide quotes question
counts from the seed alone; the manifests are a separate proven step.

**Two fixture manifests, not the seed's eight releases rewritten as manifests.** Reason: the
seed's fixed ids are quoted by the guide and the board; migrating them is a slice of its
own with no new proof in it.

## 2026-09-17 — SelectItem lists in AppTrak's shape

**Stage list header assumed `'stage'`.** Robert gave three header identifiers (`release-kind`,
`event-kind`, `work-item-kind`) and the read query; he did not name the stage list. Options:
a `moveit.Stage` table of our own; read AppTrak's list by a guessed header. Call: read the
list, header `'stage'`, one literal in nine files. Reason: the list exists and he said all
ran; a table of ours would duplicate it. Wrong guess costs a find-and-replace. *Corrected by
him the same session: `'stages'`; he then pluralised his four to match (`release-kinds`,
`work-item-kinds`, `link-kinds`, `event-kinds`), and the repo follows.*

**`link-kinds` included though he named three lists.** `WorkItemLink.Kind` needs it. Call:
003 creates it if missing. Reason: find-or-create is a no-op if he made it, one header and
two members if not.

**Member identifiers unchanged.** He gave header names only. Call: keep `featureset`,
`dependsOn` and the rest as ratified 2026-09-14, since the Kind columns store them.

**Fixture seed stands in AppTrak's stage list and deletes the old header rows.** Real runs
never execute the seed, so neither touches the real database.

## 2026-09-17 — the real run, recorded from memory

**003 made insert-only.** Robert reported the real `core.SelectItem` already had Stage rows.
Options: leave the MERGE's update branch (keeps our Sort/Display authoritative, rewrites
AppTrak's rows on every run); drop it (existing rows untouched, our Sort only applies to rows
we created). Call: drop it. Reason: the guide promised no existing AppTrak row changes and the
MERGE broke that promise once already; a lookup script this repo parks for another team must
not own their reference data. What the real Sort values are is now open item 14.

**Notes 2 and 3 read together as "rollback variant A".** His note 2 said only "rollback
variant" and note 3 "I saw rollbacks that I remember". The guide's rule: any rows in Result B
means a fresh Deploymentat on redeploy. Call: record variant A, and the two Result C details
(no-block Deploymentat, Stage source) as not brought back. Reason: his numbering drifted from
the guide's; the words match Result B, not Result C.

**05 empty recorded as probably honest, not as a bug.** Options: treat an empty inbox as the
Sort join failing and rewrite 05 defensively; record both readings and let item 14 decide.
Call: the latter. Reason: 26 deployment rows and 32 endpoints without evidence say only DEV
sends blocks; a defensive rewrite would hide a real answer behind a guess.

## 2026-09-14 — Move It board, level 1 built

**Question 01 drawn as lanes, not a grouped table.** The spec said "every open work item
and its stage, grouped by application." Options: a grouped table with a stage column; a
kanban-style lane board. Call: lanes — one row per application, one column per lane. Reason:
the governance reader reads a lane board without translating; "where is it" is a position, and a
position is a column. The one bold element on the page; everything else is quiet.

**Two lanes before DEV.** 01 returns `with the devs`, `not deployed` and `no evidence` as
statuses that are nowhere. Call: "With the developers" and "Built, not seen" (the latter
holding both `not deployed` and `no evidence`, the reason said on the chip). Reason: an item
that is nowhere still needs a place on a board that claims to show everything.

**Peers share a lane.** VAL and UAT have equal `Sort`. Call: one lane, labelled "VAL / UAT".
Reason: the sequence says they are the same step; two lanes would invent an order.

**`ReleaseId` added to 01's output.** The board needs 02's release row for a chip's flags
and detail; 01 only carried the release name. Options: join by (ApplicationId, Name); add
the id. Call: add `r.Id AS ReleaseId`. Reason: names are not keys. The file is "both"; the
column moves with it.

**Stage hues copied from Atlas, not imported.** `stage-hues.mjs` repeats Atlas's pinned map.
Reason: §13 says own JS tree; the hues are deliberately the same so a stage reads the same
colour in both views. If the map changes, it changes in two files.

**Unnamed applications shown by id.** Applications 3 and 4 have no name anywhere in the
database. Options: derive from the endpoint moniker ("LedgerService DEV"); show the id.
Call: the id, muted, "Application 3". Reason: no inference from naming; the moniker is a
label someone typed for an endpoint, not the application's name. Item 10 is the fix.

**Connection string in `appsettings.Development.json`, none in `appsettings.json`.** Reason:
the module is opt-in (§13); the checked-in default runs Census file-only, and the dev
profile points at the local fixture database. Demo profile unchanged: it has no AppTrak.

**Chip detail shows the release, not the release page.** Levels 2 and 3 (application,
release, work item trail) are the next slice; the detail column is the seed for them.

## 2026-09-14 — Move It board, spec draft (§13)

**The board is a Census module, not a wired-to-AppTrak-site page.** Robert's fact:
Census runs inside AppTrakWeb in the deployed environment. Call: resolve open item 4 as a
Census module in the Estate/Atlas pattern (own Razor page, own `wwwroot/js/moveit/`
tree, own API controllers). Reason: same process as AppTrak in production, and the only
code in reach here.

**Optional connection string; module absent without it.** The board is the first Census
code that reads SQL. Options: make the connection required; read the fixtures from a JSON
dump instead; optional and unmounted when missing. Call: optional. Reason: Estate and
Atlas stay file-only and untouched; the repo still runs with no database.

**Landing page shows five counts plus question 01, not all twelve.** Reason: questions
05–11 are the architect's; the governance reader asked "where is it," and the inbox is
Robert's queue. Every question stays one click away. Listed as an open item for him.

**SQL runs from the question files verbatim, path configurable.** Reason: rule 9 (one
file per question) and the no-inline-SQL standard say the same thing; the files move to
AppTrak's repo later and only the path changes.


## 2026-09-14 — Move It question queries

**Shared derivation copied into each question file, not views.** Six of the twelve
questions need the same location derivation (stage sequence, observed+asserted
deployments, build order by first-seen, holds, at-stage). Options: views in a `moveit`
schema; one file with all questions; copy the CTE block. Call: copy the block. Reason:
AppTrak has no views or procs anywhere, and rule 9 wants one file per question so a wrong
answer is fixed in one place without touching a table. The duplication is the cost; if
the block changes, it changes in six files — grep for `holds AS (`. Revisit if the board
needs them as views.

**The location rule was wrong and is now refined (rule 5).** Rule 4's "within the build's
own release" lost Sprint 42 from PROD the moment the hotfix replaced its build. Call: at
stage S iff a holding build was ever deployed at S and the build there now is not older
(first-seen) than it. Reason: carries work forward through later builds and drops it on
rollback with no lineage table; reverts stay explicit. Recorded in the spec.

**`contains` renamed `holds`.** `CONTAINS` is a T-SQL keyword. Cosmetic.

**Fixture additions to exercise empty answers.** Ready-to-approve, PROD-without-approval,
deployed-before-approval and skipped-a-stage all returned nothing from the original seed.
Call: two Team A releases at UAT (one ready, one blocked), release 4's approval removed,
the hotfix left as deployed-before-approval, two other approvals moved a day earlier so
the same-day timing is deliberate rather than accidental. Reason: fixtures are the
coverage; an empty result proves nothing.

**"Release started" = earliest of attributed builds and work items' first builds.** Lead
time and hotfix interleave first used attributed builds only, which said Sprint 43 began
on day 45 when its first work landed in DEV on day 30. Call: union both. Reason: the
sprint's real start is when its first work item hit DEV.

**Team A's app has no name anywhere.** Regime coverage shows NULL for application 4.
Call: leave it. Reason: the Application registry is open item 10; inventing a name column
in moveit would be a second registry.

## 2026-09-14 — Move It AppTrak artifacts

**Where the AppTrak SQL and seed live while AppTrak's repo is out of reach.**
Options: a folder here; wait for the repo; the scratchpad. Call: `apptrak/` at this repo's
root (`sql/`, `seed/`, runner). Reason: it has to be versioned and portable today; the
spec already says these move to AppTrak's repo when it is in reach (open item 11), and a
top-level folder makes that move a cut-and-paste.

**`ReleaseEvent.By` vs `CreatedBy`.** The ratified DDL had only `By`, described as "who
recorded it". Call: `[By]` = who did the act (approver, tester); `CreatedBy` = who recorded
the row, matching every other `moveit` table. Reason: the two are different people the
moment anyone but Robert approves anything, and the seed needed a demo marker that does not
overwrite the approver's name. Also `By` is a reserved word and is bracketed. Spec updated.

**Deploymentat when the payload has no deployment block.** `HealthReport.Deploymentat` is
NOT NULL, so half the real apps must be writing *something*. Unknown what. Call: the seed
writes `0001-01-01T00:00:00+00:00`. Reason: it is the type's minimum, cannot be mistaken
for a real deploy, and the backfill never reads it (rows with `Build IS NULL` are excluded
before the comparison). Confirm against real data with query C in
`history-deployment-episodes.sql`.

**Is `HealthReport.Stage` the registration's stage or the payload's?** Unknown without the
processor code. Call: the seed treats it as the payload's claim (endpoint 22 is registered
VAL and reports PROD), and `moveit.Deployment.ReportedStage` copies it. Reason: if it is
actually the registration's stage, the four-voice finding loses one voice but nothing else
changes; if it is the payload's, the fixture is right. Either way the registration stage is
reachable via `EndpointId`.

**Ping cadence in the seed.** Options: 10 minutes (real) or coarser to keep rows down.
Call: 10 minutes, 70 days, 13 endpoints, 131,040 rows; a setting at the top of the seed.
Reason: the backfill's cost profile should be tested at the real density, and SQL Server
handles it in seconds locally.

**Stage vocabularies for the two teams in the seed.** Call: Team B = DEV, VAL, PROD; Team A
= DEV, UAT, PROD; four stages org-wide, VAL and UAT peers at the same `Sort`. Reason:
matches what Robert described; the per-app stage list is whatever endpoints exist.

**ApplicationIds in the seed.** No Application registry exists in the database (open item
10). Call: plain integers 1-5 with the names carried on the endpoint and payload rows.
Reason: nothing else to reference; the registry's shape is unknown.

**Which app carries which rollback variant.** Call: WidgetCore PROD gets variant A (fresh
Deploymentat on redeploy), Reporting PROD gets variant B (original Deploymentat). Reason:
both must exist in the fixtures because real behaviour is unknown (hard constraint); the
rule catches both, and query B in the history file tells us which one is real.

**Seed marker columns.** Call: `HealthEndpoint.Tags = 'demo'`, `HealthReport.SessionId =
'demo-seed'`, `moveit.*.CreatedBy = 'demo-seed'`; fixed ids via `IDENTITY_INSERT`.
Reason: idempotent re-runs need a clean delete, and deterministic ids make the fixtures
citable in queries and docs.

**`SET QUOTED_IDENTIFIER ON` everywhere.** `HealthReport` refused a DELETE under sqlcmd's
default (off). Call: set it at the top of the seed and the backfill, and pass `-I` in the
runner. Reason: belt and braces; the real environment may run these from a different tool.
