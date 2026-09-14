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

Context (2026-09-14): two web-development teams (the situation itself lives in .docs/local/, never in git);
Team
A uses Azure DevOps; Team B uses a Jenkins-based pipeline. He built Team B's
application-tracking site (health, ApiRequests, Errors, Messages for a dozen-plus
apps across four stages), on which Census also rests. Later, Team A's
apps join both the tracking site and Census. Move It is worth building against
Team B regardless.

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

**The design question underneath "storage" is identity across the seam.**
Census knows an IIS app by machine, site and path, with system and stage
asserted. The tracking site knows an app by the name in its health response.
Move It needs one human-asserted join between them. That is the thing to spec;
where the bytes sit follows from it.

## 9. Open items

1. Extract distinct deployment events from raw health responses into a fact
   table — the first concrete slice, and the prerequisite for everything else.
   Robert's process, Robert's call on shape.
2. Backfill: for apps already in the regime, reconstruct release history from
   ping history and attach manifests to past builds from the emails. Zero new
   collection code; the field trial's first exercise.
3. What does Team A's Jenkins job put on the box? A version in the assembly or a
   text file in the deploy folder is observable by the collector without an
   endpoint.
4. Whether the ledger's *presentation* (the "where is it" board) lives in the
   tracking site or Census. Data lives in the tracking site; the board could be
   either. Not today's decision.
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
