---
# ── minted by the app; do not hand-edit ──
schema: 1
id: census-3754                 # immutable join key — never change this
created: 2026-07-31

# ── required ──
name: census

# ── essence: fill in as the idea forms (all optional) ──
description:
intent: execute a census of the machines
value_prop: "Answers about the estate from evidence, not from asking someone — what is on the machines (Census), what the systems touch (Atlas), where the work is (Move It) — reasoning in .docs/value-proposition.md"
scope:

# ── state ──
phase: discovery
next_step: 'Pushed 2026-10-16 (3fb8663..1dc9bce): the five smoke-test fixes. Pull on the live environment and look — the Changes window with two dates, Division with the rail and scope, Releases on All, the Calendar coloured by release. Then /day on the real estate (what reads wrong). Slice 4 (the Move It join) waits on the machine → application mapping on real data; slice 5 (the landing) after a week; the week of generated demo days is the next demo-side slice. Still pending from 10-09: the two AppTrak scripts once, question 14 with the #Id, tick AppTrak cross-cutting, canonical names + Layered on one system. Then the Move It Sort UPDATE and nine steps.'
standing: underway          # underway|parked|blocked|review — where it sits across the range (docs/STANDING.md)

# ── synthesis ──
themes: []
relates: []
---

## notes

### 2026-10-16 (close — "push it": 3fb8663..1dc9bce pushed to origin/main)
- The five smoke-test fixes pushed on his word after the summary; his uncommitted
  `config/views.demo.json` edit left alone, as it was his.

### 2026-10-16 (smoke-test round, five notes as they arrived; pushed at close)
- "Census-Estate on the [Changes] tab when i have selected two dates. looks great. however i
  think we should add the actual date of the change to each line." A window diffed first vs
  last, so no line knew its date; the API now walks every night in the window and stamps each
  line with the day it appeared; the panel prints it when a window is set. A change that came
  and went is two lines, not none; the day page's range keeps the single diff (open item in
  day-view.md). Day suite 50/50, seen in Chrome on LOGBOX's two nights.
- "MoveIT, the Division tab… filter by system, or see all. another vector, sometimes see only
  the current work effort plus what is in PROD, or i want to see ALL releases." Division gets
  the §26 rail and a two-word scope. "MoveIT -> Releases… when ALL are selected, we should
  filter the results to show the current work efforts plus the currently in production
  release." One rule for both pages, `currentReleases()`: on the way, recently live, or the
  newest live of its application; node test 6/6; both pages seen in Chrome on the fixtures.
- "MoveIT -> Calendar, the details slide in cannot be closed… hidden UNDER the horizontal
  header." The drawer was anchored to the pane; now to the body, so it starts under the header.
  Seen in Chrome: August 30 opened, × closed it.
- Calls logged in calls-made-for-you.md (what "current" means; the scope as a header pick).
- "on the calendar we need better coordination or synchronization of colors. either releases
  need to be coordinated (i think this best) or stages. what do you think?" Position: release,
  as the calendar's named exception to the stage-hue invariant, hues per shown month capped by
  a palette setting, a hover thread for the rest. "spec and go." Spec §21.2, built, node test
  7/7, seen in Chrome (Sprint 42 one green across five days; hover lit the thread).

### 2026-10-15 (close — "Go ahead and push and end session": 23ec128..3c84592 pushed to origin/main)
- Asked whether anything else was worth pushing on before he looked at home; position: no —
  the week of generated days moves the latest fleet date and every pinned count with it, its
  own slice after he has seen the page. He ratified by pushing.

### 2026-10-15 (night — drift discounted in the API, fixtures that judge; committed locally, 8e3ace2)
- "Anything else we can continue on now?" Position: the open item that would have spoiled the
  first live look — every real box drifts daily, so the headline would have read *every
  machine changed*. Built: `drift` on the row, status and month count ignore it, rows kept so
  the fold still names the machine. Then the fixtures item from the earlier "Go": WEB01's
  07-30 snapshot carries the AV and an unapproved editor and lacks URL Rewrite (07-31, the
  blessed day, untouched — nothing as-of-latest moved), so three of the four judgements are
  pinned by `Test-Day.ps1`; LOGBOX has an 08-01 snapshot on which only free space moved, via
  the stage-topology generator (re-run byte-identical elsewhere). The fourth judgement (added
  as a deviation) has no fixture: every two-snapshot machine is clean on its latest by design.
  Day suite 48/48, every other suite green, seen in Chrome. Calls in calls-made-for-you.md.

### 2026-10-15 (evening — the cost, measured and cut; committed locally, NOT pushed)
- "I won't be able to test in live until tomorrow. What else can we do today?" Position:
  measure the day page before he hits it on the real fleet, then the demo fixtures. His "Go".
  Synthetic trees (60 and 150 machines × 30 days, the demo WEB01 snapshot varied) served with
  `Census__RootPath` on a second port: the month grid 1.9 s at 150 machines, a day 0.9 s —
  reads, not diffs. A parsed-snapshot cache in `CensusStore` keyed on path + length +
  last-write time, bounded by two new settings; the month walks machines in parallel. After:
  month 0.9 s cold / 0.2–0.5 s warm, day 0.5 / 0.3. A rewritten snapshot read fresh at once.
  Suites green. Table in day-view.md §10; the call in calls-made-for-you.md. Fixtures not
  reached.

### 2026-10-15 (later — slices 2 and 3 and the way in; committed locally, NOT pushed)
- "No need to push, I just want to proceed and get as much done as possible." Took the
  spec's slices in order. **Slice 2, What it means:** a finding now carries a key (kind,
  machine, the thing found — a cert's thumbprint, not "expires in 15d"); the day endpoint
  diffs the findings stream as of the day against as of the day before (a range: To against
  From) and returns born and cleared; a fifth heading above the four groups, severity first,
  born before cleared, the same finding on several machines one row, state and severity as
  words. On the demo's 07-31: *Never successfully collected* cleared on the five first-seen
  boxes, *Behind fleet patch level* cleared on six after the build landed. **Slice 3,
  expected or not:** an installed-software event carries a word judged on the row's own two
  snapshots against the machine's approved baseline — added and approved *expected*, added
  as a deviation *unexpected*, a required item removed *unexpected*, a deviation removed
  *expected*; silent on servicing rows, version changes, optional removals, machines outside
  every baseline. The demo has no judgeable install (its one added app is a servicing row),
  so the four cases were planted in a scratch copy of the demo tree on a second port and seen
  in Chrome; logged as a fixtures open item. **The way in:** *The day* as a quiet link first
  among the Estate's header actions. Tests 32/32 + 37/37.
- Not taken, by his own words in the spec: slice 4 (the Move It join) needs the machine →
  application mapping solid on real data first; slice 5 (the landing) is his call after a
  week on it.

### 2026-10-15 (the drift fold; committed locally, NOT pushed, 996f8aa)
- "where were we?" then one line: "fold the percentFree drift, go". A drives row whose only
  field is percentFree is drift; every drift on the day folds into one Platform line, *free
  space drifted on N drives*, machines once each. A drive that also changed health keeps its
  row; the Changes panel keeps every raw row. The fold lives in the projection, not the API:
  a drift-only machine still reads *changed* in the headline and the grid — logged as the
  open item that replaces this one, with the API marking drift as the next step if it reads
  as noise on the real estate. Test-DayEvents.mjs 23/23; in Chrome on 07-31 Platform went
  from 15 events to 7. `calls-made-for-you.md` has the call.

### 2026-10-14 (later — the day page, slice 1; pushed the same evening, 41b9b20)
- After the push he reported the estate "looking good" and named the next concept in one
  breath: a Calendar of daily deltas as a possible landing page, filterable by machine and
  stage, "let's think about just WHAT a client would want to see. any ideas?" Position taken
  (landing is Today, the grid is navigation, a machine calendar apart from Move It's
  application calendar, a projection not a second engine, no lifecycle) and six things a
  client wants, ranked: the honest headline incl. *not collected*, one event not N rows,
  grouped by meaning, findings born/cleared, expected vs unexpected, the range. His "go".
- Spec `features/day-view.md` (§1–§13, slices 1–5, open items), then slice 1: `/day`, its own
  JS tree and CSS, `DayController` (`/api/day`, `/api/day/month`), `ChangeEntries.Flatten`
  lifted out of the feed controller. Tests 24/24 + 16/16; every state clicked in Chrome.
- Calls logged: default = latest collected day (not latest delta); apps under Platform; one
  machine in scope by pressing its name; `/` stays the Estate; the day's universe is
  configured + collected, not the canvas's ghosts (found by the test — the canvas draws two
  assertion-only names).
- Seen on the demo and logged as the first open item for slice 2: drive percentFree drifts
  every day on every box and will bury a real fleet's page.

### 2026-10-14 (pushed — the live build had been five slices behind)
- He came in thinking the live environment was current. It was not: GitHub sat at the 10-09
  morning push and the five live-note slices (91314e4..a160e93, 34 files) were local only.
  That explained his day — in the estate view he picked machines and opened Changes and saw
  only yesterday-vs-today (the From → To window was unpushed), and he could not assign layers
  (the inspector layer row was unpushed). On "push": fast-forward eec7bb0..5e579b5, nothing
  on the remote was ahead. Rule held: committed and waited for the word; the cost was a day
  of him working on old code — the dispatch headline should have said *unpushed* louder.
- `config/views.demo.json` carries uncommitted demo state from use (a dev-stage filter and a
  pinned node on MyWeb, a Reporting view). Left alone; it is runtime state, not a slice.

### 2026-10-09 (later — five fixes from his live use, committed locally, NOT pushed)
- Notes arrived one line at a time while he used the pushed build on the real estate; each
  became a slice, verified, committed: a From → To window on Fleet changes (first collected
  day in the window vs the last, per machine; the call logged); the layer tagged from the
  Atlas inspector — the one exception to "Triage keeps the pen", the leaf-walk lifted into
  `estate/entity-tags-edit.mjs` so both writers share it, the card now says *untagged — click
  to tag a layer*; "or maybe drag drop?" answered with a position (inspector first, drop on
  the Browser band cannot say web or spa) and logged in layered-view.md §9; the Move It rail
  as a set (click toggles, All clears, remembered rail-wide as `moveit.rail.apps`, every page
  scopes to any of the chosen); link-kinds kebab-cased on his ruling (reverses the 09-17
  "identifiers unchanged" call) with `004-link-kinds-kebab.sql` for the real database, tested
  in all three states; question 14 made loud after "six resultsets, all empty" — a miss
  returns the reason and the item list, `@Title` as the alternative, and the item detail
  shows *#Id*. 33/33 Move It pins; headless shots for every UI slice.
- Fact learned: the real AppTrak lives on the work server ("All run, but Not on my laptop").
- `after-pull-2026-10-09.md` carries every new step; `calls-made-for-you.md` every call.

### 2026-10-08 (the hot potato — a PROD site pointed at a DEV service for a year)
- He came in with it: "something that I should have seen in Atlas". Two approaches
  weighed, his layered architecture diagram and an audit; position taken: the audit as a
  fact of the graph that every surface inherits, the diagram later as an Atlas strategy
  (it needs a layer per node, a new human assertion). Four open items put; he answered
  "I'm not sure what I'm supposed to rule on" on the first — explained, then "follow your
  lean" — and ruled the rest in one line each (one stage vocabulary *for now*, up is a
  finding, acceptance in its own file); "once you complete the spec just go ahead and
  start building".
- Built `stage-crossings.md` §1–§7: `StageCrossing.Judge` (down / up / mixed / unordered /
  unjudged), `GraphComposer` lifted out of the graph controller (behaviour-preserving, the
  §8 counts held), the reading on every graph edge, a `stage-crossing` finding on the
  caller's machine, the word on Hosting and blast radius, counts in the toolbar and
  registry panel, Accept/Withdraw in the inspector writing `config/stage-crossings.json`.
  Demo fixtures regenerated with a PROD → DEV http edge and a dev → prod derived one;
  `tests/Test-StageCrossings.ps1` 19/19; headless Edge shots of six states. **Committed,
  not pushed** — his word.
- Then the layered view, defined in conversation: browser / server / data rows, stage as
  the depth axis, downstream services to the side, a 3D view ("a great wow factor") as the
  named follow-on. "Go" → `.docs/features/layered-view.md`, six open items first with leans;
  "your lean on all six" → built: `layer` on the association (web / spa / api, suggested),
  Triage carries it, `layered-placement.mjs` (pure, 15/15 under node) and `layered-view.mjs`
  beside physics, builder and toolbar Layout segment, key rows; demo tags; headless shots.
  **Committed, not pushed.** Then his ruling: **3D parked** — "I want to really look at
  the 2D view and refine it before we go 3D". The refinement round is the next thread.

### 2026-10-07 (first look in the wild — the stage list has no order)
- He ran the real server and opened Features and fixes: asked what the three lane
  headings mean, and reported a release deployed to PROD on Aug 20 reading *48 days
  here* and **late**; "maybe user ignorance". It was not: his real `stages` list carries
  one `Sort` for all four stages, so the lanes merged into *prod / val / uat / dev* and
  question 02's untied highest-stage pick called PROD releases late. He confirmed the
  diagnosis himself mid-stream ("late is determined by stage order"; "ah, set SORT in a
  table").
- "build": §27 — a warning line when every seen stage shares one Sort, deterministic
  tie-breaks in five questions, *N days in UAT* in a peers lane, *shipped <date>* at the
  top with a fold into the application cell after ShippedDays, *to PROD* by lane not by
  the literal name (his identifiers are lowercase). Fixture check 26/26; headless Edge
  shots of both states sent to him. Committed cf5fcd3, **not pushed** — his word.
- His one step is data: the UPDATE in `.docs/move-it-round-2026-10-07.md`.
- Then, from the same session: a release he took for a feature on Division turned out to be
  an empty release (an orphan); the delete is on the release page (§16). "Features should be a
  first class citizen … maybe Releases as well … sorting, paging, and facet filtering … but i
  don't want to stifle your creativity, so come up with some options" → four options put, his
  "you just surprise me" → §28 built: two registers on one `Register` component (find, pills,
  facets with counts, sort, paging, state in the address), a step line per row, 13 served as
  the story. Verified headless; shots sent. A quiet Back on the release page (§28.6). **Pushed 0f03ccf..5811b19 on his word.**

### 2026-10-01 (evening — feedback from the wild: screen space, scope, Atlas, web addresses)
- Move It feedback: Calendar, Division, The week, Where is it and History "very very
  good" but "somewhat unusable" — he had me guess why; the answer was screen real
  estate (stacked header bands). Three options put; **B (a left rail) ratified**;
  Calendar first as practice (§26), then his redirect (tabs to a thin top bar, stage in
  the month header, key as a float-over), then the same frame on every page (§26.1).
- Estate: asked whether the team/class filter should reach the tabs — it already did
  for four (built 08-28); spec'd and built Triage and Findings joining it (§12.1), then
  "make the rail stay clickable with a panel open" (§12.2).
- Atlas: builder offers grouped / every entity where canonical names exist (§9),
  starting stages and a name (§10), stronger stage focus, toolbar in parts and centred,
  closable inspector, boxed key, coloured current tab, a four-dot mark for every-entity
  tabs (§11–14).
- His report that a config endpoint pointing at another system's site was never
  recognised: confirmed not his fault; spec'd and built **web addresses resolving
  through IIS bindings** (census-web §13) — Atlas, blast radius, Hosting, Triage.
- Stage order DEV → VAL → UAT → PROD as one setting (census-web §14).
- Then "get everything done so i can see it in the wild tomorrow morning": wildcard host
  headers (census-web §13.6), a scoped Findings export (§12.3), and Move It §26.2 (one
  hold band per day, the app choice carries between pages, compact Division header,
  unstretched week cards). Pushed.
- 14 commits pushed on his word, then the follow-ups above. His Atlas demo tabs in config/views.demo.json stay
  local and uncommitted.

### 2026-10-01 (Calendar, the backfill stamp, and four gaps closed)
- He ran 002 on the real server (01 had failed on the missing column) and
  renamed `HealthReportId` to `ReportId` there; 001, the seed and the docs
  follow.
- Asked for a calendar view after clicking through the tabs; spec'd (§21),
  two questions ruled ("not machines, not teams"; no release link "not
  now"), built: arrivals, events, targets, rollbacks on a month grid.
- "Do the backfill run stamp … go with your lean": `moveit.BackfillRun`
  (§21.1), so the calendar says *recorded through* and an empty day before
  it was quiet; holds drawn as spans; the rest of §21's open items ruled
  on the lean.
- Asked "what are we missing?"; ratified the recommended order: fixture
  check (§22, 26 asserts), needs-a-word on History (§23), Division's
  coverage line (§24), The week, a printable seven-day page (§25).
- Mid-stream: the Census classic dashboard trend did not handle 30+ days;
  rebuilt on a calendar axis with 30 / 90 / All and a machines-collected
  strip.
- New round checklist `.docs/move-it-round-2026-10-01.md`; pushed on his
  word.

### 2026-09-24 (Coming — the notebook of what is heard, §20)
- He opened as the product owner: a place to keep what he hears in meetings
  about features coming to apps he does not control, and a view that shows
  where features are with a way to add what is coming. "Not Jira" — his
  ruling; a witness log, one entrant, no assignee, estimate or priority.
- Spec written first (§20), "it's a go", then built. `WorkItem.ReleaseId`
  nullable, `ApplicationId` added and migrated in place (002 idempotent);
  01 and 13 gain status `no release`, `Since` = day recorded for pre-build
  items; the board's first lane is *Coming* (no release + with the devs);
  a *Coming up* line above the item lanes is the board's first write
  (`api/moveit/add-item`, `workitem-add.sql`); History's form lists the
  application's heard items as a pick list (`workitem-schedule.sql`, plus
  attach when a build is named). Loader passes the application. Seed
  carries three heard items.
- Verified through the API, then rendered in headless Edge (board, History,
  and a throwaway harness for the chip detail and the pick list) because the
  extension was not connected. Screenshots sent to him in the session.
- "All three" on the follow-ups offered: a null build note now keeps the
  stored note; delete release returns items older than the release (the
  notebook ones) to Coming instead of deleting them; the seed pins every
  item's recorded day. Each verified through the API, each its own commit.
- He can only run scripts by hand in SSMS on the real server; no SQL Agent.
  004's daily job is shelved there; the backfill is a manual run before
  reading the board (move-it.md item 17).
- Remote session: eight commits local, not pushed, per his rule.

### 2026-09-23 (pushed; the remote-session push guard named)
- He asked whether anything was outstanding, then "Push". Twelve local
  commits (`b8f7d58`..`4aeeef7`) went to origin. The `git push` deny in
  `.claude/settings.local.json` was his own remote-session guard from
  09-21, lifted at home on his word; the rule behind it is now written
  down (memory + collaboration refinement log): in a remote session,
  commit locally, never push; the push waits for his look at home.
- Asked whether a personal `/bob-rc` command could start remote control
  and switch the guard on together. Answer from the docs: not as a slash
  command; a shell wrapper around `claude --remote-control` plus an
  env-var-checking PreToolUse hook would do it. He is not sold; parked,
  not built.

### 2026-09-22 (History count fixed; the value proposition; Traffic discovery note)
- History's filter chips now count only unnamed builds past DEV, as question
  05 does (fixtures: 9 where 16 were unnamed); DEV rows keep *Name it* but
  lose the inbox highlight. §15 open item closed. `1f47686`.
- Brainstormed the value proposition and he ratified the line into
  `value_prop`: *answers about the estate from evidence, not from asking
  someone*. He wanted the reasoning kept too: `.docs/value-proposition.md`.
- He described the seam he cares about: not integrating with the mainframe,
  but the file traffic between the websites and it, with the DMZs as the
  observation point ("I will record/monitor the DMZs"). Written as a
  discovery note in the Move It pattern, `.docs/features/traffic.md`,
  unratified, ten open items; the first two (how many DMZs, what runs on
  them) decide the collector. `e09e689`.
- Personal context from the session went to git-ignored `.docs/local/`, not
  the repo.
- Everything still local, unpushed, by his standing rule.

### 2026-09-21 (field notes fixed; Division, the executive tab)
- Four notes from using Move It on real data, all fixed and fixture-verified
  (spec §17): *Add another* no longer blanks the new release's name; Delete
  release cascades (stabilization only, the one exception to never-delete);
  `questions/13-feature-picture.sql` returns one feature's whole picture as
  JSON with latency, filterable by project and stage; stages are filtered to
  those seen, in every question as well as the lanes. The filter also fixed
  a real error: an unused stage above PROD had been read as PROD by 09/10/12.
- "The board should be the basis for an executive view" → built as release
  cards on the board (§18), then refined on his fuller brief into **Division**
  (§19): a new first tab, `/moveit/division`, a step line per release and a
  thin one per feature, grouped by project; client sign-off is a step derived
  from verified/approved events; went-live-without-sign-off shows "!";
  Team A's asserted positions are drawn dashed (a rule-6 gap caught in the
  assessment). Board back to features-first. Tab bar across Move It.
- His rulings: everything local, never pushed, by design — he reviews on the
  laptop at home, adjusts, pushes, then installs on the real server and
  reports back. He is the only executive until development is complete, so
  the read-only gate is deferred. Permission prompts removed for this repo.
- Five commits, `53103a5`..`ca645a9`, local. Real-side checklist:
  `.docs/move-it-round-2026-09-21.md`.

### 2026-09-20 (board repair — the frontmatter had stopped parsing)
- Trail Boss reported `project.md` frontmatter did not parse. Cause: a raw
  0x04 byte inside `next_step`, where `sql/004-create-backfill-job.sql` had
  been written as `sql` + backslash + `004-...` and something octal-escaped it. Illegal in a
  JSON string, so the whole file failed and the project was off the board.
  Repaired to the real path, `apptrak/sql/004-create-backfill-job.sql`;
  `tb scan` and `tb ride` now read it whole.
- No project work this session. `next_step` stands unchanged.

### 2026-09-18 (History on real data; the ledger falls behind)
- He has History running on real data and asked how to use it before acting.
  Clarified: *Name it* names the release a build belongs to, not the
  deployment; one release claims many builds (`ReleaseBuild`), a feature
  enters once (`IncludedInBuild` set only where null); DEV churn need not be
  named. Recommended and taken: retrofit PROD builds first, newest backwards.
- The ledger was already behind after a real day's work. Until Part E (his
  processor change), keeping it current is one idempotent script,
  `backfill-deployment.sql`. Added `004-create-backfill-job.sql`: a SQL Agent
  job, CmdExec over that file, daily 06:00. Created and inspected locally, not
  executed — his ruling: not on the dev machine; local copy deleted.
- Flagged for next: the History filter should hide rows at DEV (§15 open
  item) or the unnamed count overstates the retrofit.

### 2026-09-17, later (level 3 — the release page, §16)
- "go" on the release page. Built and browser-verified: `/moveit/release/{id}`
  — what is in it (01's status per item), builds it claims and where the
  ledger has them now, events newest first, 02's flags in the subtitle.
  Entry: record an event (validated kinds/stages, build from the claimed
  set, by whom required), pull an item with a reason, rename in place. All
  idempotent; nothing deleted. Linked from History (release name) and from
  the board's chip detail. Demo reset restores the seed.

### 2026-09-17, night (the History page — §15 built)
- Ratified: entry lives on the Census board "because that is where I will be
  using it", with one standing requirement: a read-only view for the
  governance reader that eventually appears on the sidebar nav. Recorded in §15.
- Built and browser-verified: `/moveit/history` — the ledger newest first,
  unnamed builds counted per app, *Name it* / *Add to* / *New release*, one
  form, one POST (`MoveItEntry`, the loader's statements plus
  `workitem-attach`), kinds and stages validated against the lists. Census's
  first database write. Named a build, set up an in-progress release,
  attached it to a build, re-posted (unchanged), sent bad input (refused),
  reset the fixtures (clean). Lane board links to History and stays read-only.

### 2026-09-17, late (pivot: entry is a page, not a file)
- Robert read the loader's plain-English description and ruled it the wrong
  front door: he wants to navigate the deployment history recent-first and
  name what was in the builds he remembers, and set up feature sets for work
  in progress. "I'm NOT changing the overall design. It's just how to enter
  and where to enter." §15 drafted for ratification: a History page on the
  board (the ledger newest first, unnamed builds as the inbox, click a build
  to name its contents, New release for work in progress), recommended in the
  Census module, which would be Census's first database write — his to
  ratify. The loader stays as import/export and the reference write rules.
- Counsel's note: the file was recommended because it needed no UI; the sense
  of it had not landed when he ratified. Plain-English readback caught it
  before any real file was written.

### 2026-09-17, evening (the manifest loader)
- Planned what comes next; he ratified: manifest loader first, then level 3
  before level 2 (registry still owed). Spec §14 written, then built:
  `Invoke-AppTrakManifests.ps1` + `sql/manifest/*.sql` (parameterised,
  transaction per file, validates kinds and stages against the SelectItem
  lists, never deletes, orphans reported), two fabricated manifests under
  `manifests/demo/`. Verified: first load, no-op re-run, edit with update and
  orphan, invalid kind rejected, unresolved link reported, UTC timestamps,
  seed cleanup removes loader rows. Guide Part F rewritten to use it.
- Earlier the same day: the ledger moved to `moveit.Deployment` (his call);
  SelectItem lists in AppTrak's own shape with plural headers (his word).

### 2026-09-17 (the real run, reported from memory)
- Robert ran the morning guide against the real AppTrak. Nothing leaves that
  environment, so the report is his recollection, recorded in `move-it.md`
  §12.1 against the guide's nine items: history results read as deployments
  he remembers; rollback variant A (fresh Deploymentat on redeploy); backfill
  26 rows, Broken 0, second run 0; 06/07 empty, 08 three rollbacks he knew;
  05 empty; full set clean; 11 correct-looking in 59 seconds; processor change
  2–4 weeks out at least.
- `core.SelectItem` is a recursive hierarchy (header `MasterId = -1`, members
  point at it; `Grouping` is dropdown grouping only). 003 had written headers,
  not lists; Robert entered the real rows by hand and everything ran, so no
  cleanup. He gave the read query and three header names; 003, the seed and
  the nine stage lookups now use that shape. Verified: demo clean, all twelve
  questions return their fixture counts. Stage header is `'stages'` (his word).
- Robert moved the ledger to `moveit.Deployment`; renamed across the repo.
- Open items 12–17 added. Level 2 still parked on the missing tables.

### 2026-09-14, close (repo scrubbed of work details)
- Robert found personal and organisational context in the spec on review.
  Ruling: name as ratifier is fine; no details about work, ever. Scrubbed
  from the tree, then from every commit (git filter-repo, force-pushed;
  origin/main verified clean). Personal context now lives only in the
  git-ignored `.docs/local/`. Rule saved to memory.

### 2026-09-14, late (parked: board level 2)
- Robert reviewed the real AppTrak schema himself: the local copy is missing
  the tables that let a team register applications and endpoints, the
  authorization table, and a handful more. Open item 10 is answered (the
  registry is in AppTrak) and re-owed (he brings the DDL, zero rows).
- **Parked by his call:** the board's level 2 (application page) waits for
  those tables — its spine is the registry. Level 1 stands as built.

### 2026-09-14, evening (Move It — the board, level 1)
- **Open item 4 closed by a fact, not an argument:** in the deployed environment
  Census is hosted inside AppTrakWeb, so the board is a Census module reading
  AppTrak's database from AppTrak's own process. Recorded in §13. He drew the
  persona line: Estate and Atlas are *his* views; the governance reader needs their
  own navigable page.
- **§13 written and ratified in one exchange**, then level 1 built against the
  fixtures and verified in the browser: `/moveit` — question 01 drawn as lanes
  (one row per application, one column per lane, peers share a lane, two lanes
  before DEV for "with the developers" and "built, not seen"), the counts strip
  (open items per lane; past target, on hold, reached PROD this week, awaiting
  approval with how many are ready), application filter, chip → detail column
  with the release's row from 02. Fifteen open items, five applications, hold
  and late flags on the right chips, Team A's items marked asserted.
- **First Census code that reads SQL.** `MoveItQuestions` runs the question
  files verbatim (one endpoint per question); optional connection string,
  module unmounted without it; dev profile points at the local fixture DB.
  Two board lookups added under `apptrak/sql/board/`; 01 gained `ReleaseId`.
- Applications 3 and 4 show by id — no name anywhere in the database and no
  inference from monikers. Item 10 (the registry) is now visible on a page.

### 2026-09-14 (Move It — brainstorm to fixture-proven schema in one day)
- **The project widened.** Two web teams, one tracking site;
  the governance reader cannot see where features and fixes are (with devs / DEV /
  VAL-UAT / PROD). A Gemini sketch (realm→domain→capability→delivery-unit, regex
  "topology resolvers", relational DDL) arrived in `move-it/`. Ruled by
  conversation, not redraft: keep the ledger, manifest, inbox and stage
  sequence; drop the taxonomy and the resolvers (the 2025 convention-sniffing
  failure rebuilt). Folder deleted once `.docs/features/move-it.md` held it.
- **Ratified in sequence, each recorded:** release (not build) is the unit that
  moves; the build string is the only join, never parsed; the ledger already
  exists in AppTrak's ten-minute `/api/health` pings; Census's JSON stays truth
  and *projects* into AppTrak (four reopen triggers written); identity across
  the seam is endpoint-level `monitoredAs` on the IIS-app leaf; `project` in
  the payload is not a team label, recorded verbatim; `moveit.Deployment`
  written by his report processor on tuple change with four rules; a six-table
  `moveit` schema (Release, WorkItem, ReleaseBuild, ReleaseEvent, WorkItemLink
  + the ledger), five SelectItem lookups, nine derivation rules, hotfix as
  asserted intent, cross-app dependsOn links.
- **HARD CONSTRAINT recorded** (his words): no real data here of any kind —
  AppTrak, IIS logs, census evidence. All manufactured; he carries code to the
  real environment and reports back. Now in memory too.
- **Built under `apptrak/`** (parked here until AppTrak's repo is in reach):
  DDL, lookups, `backfill-deployment.sql` (THE rule, which his live
  processor must match exactly), the read-only history query for the real
  side, a 131,040-ping deterministic seed covering both rollback variants, a
  machine move, silent 503s, a partial deploy, a stage mismatch, no-block and
  no-regime apps, a skipped stage, order violations, deployed-before-approval
  and PROD-without-approval. 39 ledger rows, the count the coverage map
  predicts; second backfill a no-op.
- **Twelve question queries**, one `.sql` per Appendix A question, plus a
  runner; every answer checked against the coverage map. Building 01 exposed
  that rule 4 alone loses shipped work when a hotfix replaces its build; rule 5
  now reads "at S if a holding build was ever deployed at S and the build there
  now is not older (first-seen)". Spec and calls ledger updated.
- **`.docs/calls-made-for-you.md` created** (16 entries today). `.docs/move-it-
  morning-guide.md` is tomorrow's checklist.
- Verified: fixture-only, fully, and said so. **Nothing has touched real data.**
- `main` at `adf8e1d`, pushed, tree clean.

### 2026-08-30 (documentation session — the credential setup, end to end)
- He had started down the DPAPI route from an earlier session's instructions
  and got stuck on a question the docs never answered because it has no
  answer: **where do username and password go in `machines.json`?** Nowhere.
  A bucket holds a *path*; `New-CensusCredential.ps1` prompts for the
  credential and encrypts it in the same action. The block was conceptual,
  not procedural — worth remembering the next time a howto reads complete.
- **`.docs/credential-setup-runbook.html`** (`735fea2`): a walkthrough for
  five buckets with five different stored credentials. Leads with the
  distinction that actually blocks people — *one* account creates all the
  files (DPAPI binds to it), a *different* credential lives inside each one.
  Worksheet, eight ordered steps, run-log triage, rotation. Standalone HTML,
  no build step; also published as an artifact.
- **`credentials-howto.md` gains §4, Registering the scheduled task.** The
  real gap: the doc covered creating a credential file thoroughly but never
  said how the task gets registered, or that the order matters —
  `New-CensusCredential.ps1` catches a wrong creating account only by
  comparing against the task's account, so with no task registered its guard
  rail drops to a warning. Sections 4–7 renumbered to 5–8.
- Two blind spots in that guard rail found by reading it and now written
  down: it skips the check entirely when the task account is `SYSTEM` or
  `S-1-5-18`, and it compares **short names only**, so `CORP\svc-census` and
  `OTHERDOM\svc-census` both pass and then fail to decrypt.
- Verified: section numbering 1–8 sequential with both internal cross-refs
  updated; HTML tags balance. **Not** verified: the standalone page rendered
  in a browser — the tool refuses `file://` URLs, so the wrapper is
  structurally checked only. Said so at the time rather than implying more.
- `main` at `735fea2`, pushed, tree clean.

### 2026-08-28 (five ratified-and-shipped slices, all live-verified)
- **Atlas grouping is the view's choice** (`2efdcb7`): he built the same
  system before and after adding a canonical name, preferred the before,
  and could never see it again. Now `grouping: canonical|observed` per tab
  (toolbar chips, `?grouping=` on the graph fetch, persisted in views.json).
  Positions merge rather than replace — canonical/observed ids are disjoint,
  so one map holds both layouts. Ratified in one word. system-view.md §3.
- **Board scope reaches the fleet panels** (`7e31c12`): "can the team
  filtering apply to Changes/Software/Hosting/Certificates?" — sized at
  half a day, ratified, shipped client-side only. `panel-scope.mjs`; panels
  re-scope in place on a rail click; scope line with a panel-local
  "show fleet" escape. Hosting cuts on dependency *sources*; certs cut
  before thumbprint grouping. census-web.md §12.
- **Classic dashboard** (`e679cfc`): browse links dropped, trend bars carry
  their counts in light grey.
- **Classic column sorting** (`ab7619e`, `46e6484`): Machines and Coverage
  (attention order kept as default: never first, then stalest), Prohibited
  (display-only, file order is the default because the file is his). His
  ask wandered mid-turn — Machines → "and Certificates" → "oh, it already
  sorts" → "i mean the coverage tab" → "Prohibited needs sorting".
- `main` at `46e6484` + this close, pushed, tree clean. Demo `views.json`
  now carries MyWeb observed-mode positions (fixture drift, harmless).

### 2026-08-25 (field-trial verdicts: Atlas UX pass, DevServer retired, "prohibited")
- **Session close (third round, all his live reports → same-hour slices):**
  the REAL inspector bug found and killed (`b86de1e`) — after pointer capture
  the browser retargets the follow-up `click` to the svg, whose empty-space
  branch cleared the selection pointerup had just made; zero-jitter automated
  clicks could never reproduce it. Selection now lives on pointer events
  only; verified with a simulated 2px-jitter press. Then his rulings, each
  shipped and verified: cards dock to the TOP (`9437d28`), edge inspector
  answers from/to/verdict/seen-in + edges get a 14-unit invisible hit twin,
  columnar label/value rows — right-justified labels, gutter, aligned values
  (`5105b6d`), serves/variants join the grid (`c37f134`), **glyphs
  re-imagined** (`1d4dc75`) — cylinder/globe/cloud, his call, closing §4's
  Estate-consistency promise — and **stage colors** as a dedicated channel
  (dots + chips + key; stage-colors.mjs pins dev/val/prod… to distinct
  slots because a pure hash collided exactly those three). Ratification debt
  cleared (`9627aa7`); his real views committed on his order (`02acba9`).
- `main` at `02acba9` + this close, all pushed, tree clean.
- **The 08-20 ratification debt is cleared (2026-08-25):** entity-associations
  §7 (association-level provenance, restricted stage-only bulk apply,
  whole-leaf upgrade-on-write) and systems-registry §5 + the §3
  drift-placement deviation — all ratified as proposed, one line. Specs
  updated to ratified status.
- **He ran the 08-20/21 slices in the wild and is pleased.** The walkthrough of
  owed ratifications produced rulings on **system-view §7 only**: 1 atlas ✓,
  2 views.json "a good idea" (promoted same day), 3 one-system ✓, 4 physics "a
  good start" but objects too small, 5 "we need the Inspector, don't see it",
  6 "is there a key?", 7 smooth the neighbor experience (specifics owed).
  **Entity-associations §7 and systems-registry §5 + §3 drift-placement
  deviation got no explicit ruling — still owed**, flagged in next_step.
- **Atlas pass (`d338284`)**: nodes r15→21 + label/spacing bumps; the §2 key
  that was specced but never built now a docked card drawing swatches from the
  live CSS; inspector had two real diseases — author `display:flex` beat the
  `[hidden]` attribute, and nodes advertised only a grab cursor — fixed plus
  hover, selection glow, toolbar hint. **Views promoted to `config/views.json`**
  (GET/PUT /api/views whole-file, positions ride the view, unknown keys
  round-trip, one-time localStorage adoption only-while-file-empty with
  bail-before-saveLocal). Verified live: fixture view reopens pinned, drag
  writes the file, seeded local tab adopted up, local blob shrank to
  {active, keyOpen}.
- **DevServer retired (`f262963`)** — his rule: not data-driven, so it goes.
  Collector mints nothing for SDKs-on-Server (DevLaptop stays client-only),
  precedence and all UX lists drop it. APPSRV01 asserted class → WebServer
  (override fixture survives on provenance; the web-prod non-judgment now
  rests on stage mismatch — coverage note in approved-baseline.md §verification).
  BUILDSRV01 current snapshot roles → []; **its aged .gz twin deliberately
  keeps DevServer** as the retired-role-in-old-snapshot fixture (as-of
  2026-07-31 shows Unclassified with the role as provenance — verified).
- **"Prohibited" (`f579e77`)** — his word, ratified from my recommendation;
  'blacklisted server' is a term of art he needs free. Presentation stratum
  only: config/blacklist.json, API routes, identifiers stay. Finding kind
  slug → `prohibited-software` (computed per read, nothing stored or
  filtering on it). Verified: classic dashboard/nav, estate button, findings
  kinds live.
- `main` at `d338284` + this close, all pushed. His instance predates all
  three server-side changes — restart required.
- **Same day, second round (his live-dogfood reports):** inspector made
  **persistent** — always docked while a view is open, empty state until a
  click fills it (his twice-repeated "still not visible" ruled the design:
  visibility must not depend on discovering the gesture). Key went
  **vertical** on his call (browsers are wide; the graph wants the width)
  with its three groups named: kind — shape / state / connections.
  Association normalize centralized in `Associations.Of` (hand-edited config
  is a boundary; missing/null `system` or `stages` no longer reaches any
  consumer — the 08-14 explicit-null wound class), fixtured as a
  missing-stages entry on MyDB_DEV that merges to a semantic no-op (6
  members/7 edges/×3 variants unchanged, verified). His t1-sysetem-a view is
  an **heirloom, not a live typo** — built pre-reconcile in localStorage,
  faithfully adopted up; committed configs scan clean of sysetem-a. His
  instance runs from this repo's bin (exe lock seen) — verification used a
  scratch-output build so his process was never touched. **Edge-recede
  recommendation ratified in one word and shipped (`8a26abf`)**: three-level
  fade — full in-stage, mid when exactly one endpoint recedes = the bleed,
  node-ghost when both recede; never hidden; both levels in the key.
  Verified live under MyWeb's dev filter.

### 2026-08-21 (derived stage + canonical names)
- **He restarted, verified G-7 triage and declared entities live, picked a
  system in /atlas** — first field contact with the 08-20 slices, all good.
- **Two design questions arrived as his own concrete examples** (MyAppDB-DEV/
  VAL/prod; MyWeb across WebDev/WebVal/WebUat/WebProd) rather than a
  generalization — he said so explicitly. Rulings: machine stage becomes
  derived (usually correct), overridable, override **complete** never partial
  (his own answer, confirmed); stage variants share a per-system logical
  identity; **"canonical" is the term** (ruled mid-draft, mid-turn).
- **Both specs drafted, ratified as proposed in one word, built same day**:
  `derived-machine-stage.md` (G-8 — effective stage: asserted wins whole else
  rollup union w/ derivedFrom; `stage-override-drift` low finding, machine-
  keyed because the machine is an honest subject; no migration, deleting the
  asserted entry IS release-to-derived) and `canonical-names.md` (G-9 —
  `canonicalName` rides the association so per-system falls out of the shape
  and dangling-canonical is impossible by construction; Triage "as" field
  bulk-sets-if-absent / edit-overwrites; Atlas collapses (system,canonical)
  into one node with hosts sublabel + variant-expanding inspector; observation
  surfaces keep observed names; same-name-same-stage = farm, not collision).
- Fixtures: SQL01 stage facet removed (derived-only; db-prod baseline still
  matches through the derived stage), DEVSQLBOX/PRODSQLBOX/APPSRV01 fire
  drift; MyDB + MyWeb grouped across conventions/machines, Shared_REF carries
  two canonical names in two systems and farms across two hosts, AppDB exists
  in both MyWeb and YourWeb without collision, legacy flat leaves untouched.
- Verified live on a second instance (port 5399, demo profile): canvas
  stage/source per branch, drift findings, derived-stage baseline match,
  /atlas MyWeb 12 members → 6 nodes with inspector variants (screenshot),
  dashed derived badge on SQL01's tile (screenshot), Triage "as" apply wrote
  canonicalName end-to-end then reverted, GET/PUT round-trip byte-identical.
- **Continuation, same day:** his real-profile config edits committed on his
  order (`0a658dd` — first real declared entities + association writes);
  the `sysetem-a`/`system-a` split I flagged in that diff reconciled on his
  "fix it" (`efced6b`) — his estate now has one system-a, four members.
  Certificates UX on request: classic view hides RDP-only certs by default
  (toggle; filter keys on the collector's literal "RDP" binding source,
  never names; IIS+RDP certs never hide) with sortable columns (`6415df4`);
  same toggle + within-band sort ported to the Estate renewals panel
  (`54ca782`) — bands stay fixed, sort orders inside them. That work
  exposed a fixture impossibility: WEB01's portal cert shared a thumbprint
  with WEB02's legacy cert, merging two renewals into one; fixed in both
  snapshots, the gz twin, and the generator on his order (`de4336b`) —
  fleet now answers 11 renewals, both expired certs listed separately.
- `main` at `de4336b`, all pushed, working tree clean. His running instance
  predates the G-8/G-9 backend — restart required; the certificate work is
  JS-only and needs just a page reload.

### 2026-08-20 (second session — the association arc + Atlas)
- **The Triage attribute gesture was field-broken and got redesigned live**: every
  unresolved-endpoint row carried its own input (fill one, click another's button
  → empty refusal) and refusals rendered off-screen at the top. Now one row at a
  time, focused input, Enter saves, refusals inline at the row (`2114599`).
- **Robert stated the end goal** (observe daily w/ deltas → classify observed+
  unobserved → normalize as system-entity/stage) and drove three rulings:
  **R1** normalization = derived join + thin identity registry (never
  membership); **R2 (G-7)** the association shape `serves: [{system, stages[]}]`
  — stages belong to the system claim (his MyFancyDB dev+val / Other val case;
  the flat axes' cross-product could not say it); **R3** Triage's bar is the
  association-assignment surface. He also chose **physics-first with a
  strategy/tab architecture** for the system view and a **separate module**
  ("completely separate from observation/triage/estate") — named `/atlas`.
- **Built under his loaded "go" (he left mid-session), one commit per verified
  slice**: G-7 associations (read-both forever, upgrade-on-write, per-claim
  provenance, chip-per-claim Triage bar, stage-only-apply guard; APPSRV01 blast
  answers 2 lines not the cross-product's 4; DEVSQLBOX legacy leaves byte-
  identical); systems registry (`systems.json`, overview with member counts +
  expected-stage drift; drift surfaces in the Atlas panel NOT the machine-keyed
  findings stream — build-discovered deviation to ratify); Atlas at `/atlas`
  (own JS tree, `GET /api/system-graph/{system}`, tabbed built views in
  localStorage, hand-rolled physics that settles synchronously and freezes,
  seeded + persisted positions, ghost-never-hide stage chips, docked inspector,
  registry editor).
- **Awaiting his ratification pass** (all applied as proposed, flagged in each
  spec): entity-associations §7 (per-association provenance; stage-only rule;
  upgrade-whole-leaf), systems-registry §5 + the §3 drift-placement deviation,
  system-view §7 (atlas name, localStorage tabs, one-system tabs, sync-settle,
  inspector contents, edge/node styling, neighbor scope).
- **His running instance (pid 10900) predates all three slices** — restart
  required before any of this is visible to him. His live tree was never
  touched; all verification ran on a second instance against the demo profile,
  every mutation reverted.
- `main` at `7957180`, all pushed.

### 2026-08-20
- **G-6's trigger fired and the parked item shipped the same day.** Robert
  brought two real needs from his field trial: Task Scheduler jobs he ruled
  will never enter the collector, and external near-peer APIs common in large
  orgs. He explicitly invited counter-argument on the external case ("if not,
  convince me of why") — conceded instead: the edge is already *observed*
  (connection strings, endpoint URLs), so an unattributable target is exactly
  the unexplained pile the health principle forbids. Reading #2 of §8, per
  G-6's own terms. Invariant held: asserted never impersonates observed.
- **Spec written and ratified in one pass** (`declared-entities.md`, all seven
  open items as proposed): `config/declared-entities.json` sibling file (his
  open/closed requirement — zero existing schema touched), free-form kinds,
  external blast subject in-arc, verbatim http targets, A/B slicing, untagged
  declaration allowed, loose-port rule.
- **Slice A** (`d4dba3c`): machine-anchored entities — store, GET/PUT, declared
  rows in Triage (declare form with duplicate guard, classify/edit/remove),
  rollup contribution with resolution `declared`, dashed seam everywhere,
  dossier "Declared on this machine", blast radius hosted contributor,
  `dangling-declared-entity` finding. Verification exposed a real pre-existing
  gap: canvas universe omitted machines named only by assertions, so their
  findings never rendered — fixed, OLDBATCH01 now a ghost tile.
- **Slice B** (`59a70ee`): `ExternalAttribution` — exact-match join, estate
  machines always win, 80/443 normalize, portless-matches-any; Triage external
  card (0-match smell, shadows-SQL01 warning live in the fixture) and
  unresolved-endpoints stratum with the attribute gesture (append identifier =
  reconcile, verb 5 made mechanical); `GET /api/blast-radius/external/{name}`
  — "the partner API dies → OrderPortal prod via WEB01" answered on screen,
  every edge badged *declared target*, never a verdict. Chip now carries the
  fleet-level pile (29 = 22 + 1 untagged external + 6 unresolved).
- Also: baselines primer committed; Baselines-tab positions given (per-type =
  `class` selector already ratified; gap is a bless-from-tab entry point +
  scope-grouped list) — **ratified with "go" and built same session**: the
  panel now groups its list by scope shape (fleet-wide / by class / by facet /
  single machine, derived from `appliesTo`, never stored) and carries "Bless a
  new baseline…" — source-machine picker seeds scope and suggested id from the
  machine's class/stages; bless-refusal for a failed collection surfaces in
  the panel (verified live against BUILDSRV01); materialize-by-value held, no
  create-empty path. approved-baseline.md §9 amended + decision logged.
- **Observation flagged, then fixed on his "fix it"**: any baselines-panel
  write was serializing absent `required` as explicit `"required": false`,
  eroding the §12 fixture branch that deliberately omits the key.
  `JsonIgnore(WhenWritingDefault)` on `Baseline.Required`; verified: whole-file
  PUT round-trips byte-identical to the committed fixture, un-requiring an
  entry drops the key entirely, `required: true` survives.
- `main` at `59a70ee` + the baselines-tab commit, all pushed. Demo fixtures
  restored to designed state after every live mutation.

### 2026-08-17 (second session)
- **The whole system-graph arc shipped in one session**: three slices, each
  spec → open items ratified → built → live-verified in the browser → committed.
  Robert dismissed the §8 boundary question as born of a hypothetical — census
  tags what it observes, the Aug 7 ruling stands untouched (G-6).
- **Slice 1 — entity tags** (`entity-tags.md`): `config/entity-tags.json`,
  address-by-nesting (machine→instance→db / machine→site→path), multi-value
  `system`×`stage` leaves with provenance; resolution observed/dangling/unknown
  (absence only counts when category *and* instance report ok); machine rollups
  with `derivedFrom`; dashed derived badges on tiles; `dangling-entity-tag`
  finding; GET/PUT round-trip byte-stable, unknown axes survive.
- **Slice 2 — Triage workbench** (`triage-workbench.md`): top-bar chip with the
  fleet unclassified count, queue grouped machine→container in three strata
  (unclassified / dangling / classified toggle), unknown scopes as explicit
  rows, bulk select-and-assert with suggestion chips, edit-overwrites vs
  bulk-merges semantics. Verified end-to-end: pile 21→17, dangling removal
  cleared its finding live.
- **Slice 3 — blast radius** (`blast-radius.md`): `GET /api/blast-radius/{m}` —
  hosted entities + dependent apps via observed edges, composed into
  system×stage deployment lines with per-edge verdicts; unclassified and
  unknown stated, contradicted edges their own stratum. `HostResolver`
  extracted from HostingController, `/api/hosting` verified byte-identical.
  DEVSQLBOX answers `MyWeb (dev,val), YourWeb (dev,val)` — the fixture's
  raison d'être, on screen.
- Also: principles memorialized in `system-graph-principles.md` (Robert
  ratified the fresh re-derivation), `output/` gitignored (run-log untracked),
  his hand-edited assets.json stage facets committed with his blessing.
- **Field-trial protocol written at his request** (`.docs/field-trial-real-estate.md`):
  staged walk collection→render→edges→tagging→blast radius, each section ending in
  a Report-back list — he executes against real infrastructure and responds with
  the package. Includes the first-ever live WinRM run, watched by hand.
- `main` at `5161026`, all pushed.

### 2026-08-17
- **New direction, and it is the big one: the system graph.** Classify observed
  entities into composite applications ("select a tag, get a domain"), then
  explore the graph and answer blast radius. Concepts drafted in
  `.docs/features/system-graph.md`. **Blocked on §8** — a third of Robert's own
  example system (mobile clients, third-party APIs) is unobservable by
  construction, so classifying it means declaring nodes census can never see,
  which is the far side of `graph-interop.md` §1.1. Only he can call it. That is
  `next_step`.
- **A scar surfaced and is now a binding rule.** Fall 2025: he built a graph from
  naming conventions; it worked for most of a real estate and died on the rest —
  ambiguity, not absence (`MyDB_DEV` unresolvable once `MyDatabase_DEV` existed).
  **No meaning is ever derived from a name**, including "only when unambiguous."
  This is *why* the human-in-the-middle layer exists.
- **Fixture: three-stage WebApp→DB topology** (5 machines, 12 edges, all
  `confirmed`), with 8 edges landing on DEVSQLBOX because it serves DEV and VAL
  both. Naming traps planted permanently so no code can quietly re-acquire a
  convention dependency. `tests/New-DemoStageTopology.ps1`.
- **csproj flipped to Robert's standard**: `Nullable=disable` +
  `ImplicitUsings=disable`, 292 annotations and 30 `!` operators removed,
  verified by all 20 read endpoints being byte-identical before and after.
  Resolves the `census-web.md` §8 open item ahead of absorption — his call.
- Mid-session course correction, kept in the dispatch: he stopped the spec work
  for going to schema before concepts. The doc was restructured concept-first.
- `main` at `46d2f80` + this write-up.

### 2026-08-14 (second session)
- Real data drew blood again, same artery: a payload carrying an explicit
  `"databases": null` overwrites the model's `= []` default at deserialization,
  and `SqlDatabasesOf` threw `ArgumentNullException`. Guarded all five
  envelope-model consumption sites (`DiffEngine`, `HostingController`) with
  `?? []`. NRT never protected this boundary — `<Nullable>enable</Nullable>`
  made the call sites *look* safe, which is arguably worse.
- Decision recorded: census stays on `enable` (flipping sprays CS8632 for no
  gain), but flips to Robert's standard `disable`/`disable` when the code is
  absorbed into his website — open item in `census-web.md` §8.
- `main` at `472b2e2`.

### 2026-08-14
- First contact with real payloads found a crash: registry uninstall entries
  are not unique on `displayName|arch|hive|sid` (SQL Server registers several
  subkeys under one name), so the apps diff's `ToDictionary` threw. Fixed with
  ordinal pairing — an upgrade inside a duplicate group stays a version change,
  not remove+add. Fixture: duplicated SQL Server entry on SQL01.
- `never-collected` now cross-checks the snapshot tree before making its claim;
  files-on-disk-with-no-ok-logged emits `unlogged-collection` (medium) instead.
  New demo machine FILESRV01 carries that story (tree restored, log lost).
- Scaling ratified and largely built: run-log read amplification fixed (one
  read per request, was one per machine), snapshot aging specced then shipped —
  gzip in place after `-AgeAfterDays` (default 90, 0 = off, filename date,
  verified round-trip), yearly `run-log-<yyyy>.jsonl` segments, `.gz`-aware
  reader. Thinning and DB ingestion parked with explicit triggers; dedup
  rejected (breaks absence-is-signal). Spec: `.docs/features/snapshot-aging.md`.
- All pushed; `main` at `48f8ca6`.

### 2026-08-12
- Approved baselines specced, built, verified in the browser, shipped: bless a
  machine's software set as approved for a facet-selected scope, judge every
  machine against the union of matching baselines. Both directions —
  `unapproved-software` (medium) and `missing-required-software` (high).
- Spec: `.docs/features/approved-baseline.md`. Config: `config/baselines.json`
  (empty; real fleet) and `config/baselines.demo.json` (five baselines, the
  fixture set).
- Fixed: every error message in Census.Web had been rendering gray, not red —
  `.est-error` was declared above `.est-status` at equal specificity.
- First dispatch ever filed for this project. The `.trail-boss` files had sat
  as-minted since 2026-07-31 while the collector and the whole web app were
  built, so the board showed nothing.
- `ignite: start-census.bat` declared — the estate now starts from the board.
  Demo fleet by default (the real `output\` tree holds one stale entry, so the
  real profile renders a near-empty estate); `start-census.bat real` for the
  live tree. Both branches exercised through cmd.exe: demo 11 machines, real 1.

### 2026-07-31
-

- 2026-10-09 — while he wrote notes: ran the layered placement over every demo system; found
  and fixed two same-name nodes on one plane drawing on top of each other (bd90df0). Five
  more things that read wrong (crossing lines through intermediate planes, lines through
  labels, 22-char cut, no-canonical-name columns, sparse planes) logged in layered-view.md §9.
  **Shelved on his ruling, "we must come back to it."** Next: his notes from Census and Move It.
- 2026-10-09, the round — his 22 notes from using Census and Move It on the real estate,
  absorbed into `.docs/round-2026-10-09.md`; four answered from the record (registry, grouping,
  built-not-seen, hatched days), nine questions answered by him in one line each, one held
  ("hold the thought, we'll tackle this last"). "go go go!" → six slices, each committed and
  verified headless: findings titles by severity; Releases column order and facet cells;
  calendar Sun–Sat with Full week | Weekdays and arrivals as a sentence; the board's PROD lane
  keeps each application's latest shipped item and chips say when they arrived and when they
  are due; Compare's aspects, differing toggle and dated Day select; the dossier at a chosen
  day; History's List tab (nights that changed); the release page's deployment history,
  claim / release / move with a `build-released` event; question 14 for his not-seen item.
  Tests: Test-BoardLanes 7/7, Test-MoveItQuestions 33/33 (seven new), Test-LayeredPlacement
  17/17. **Thirteen local commits, not pushed.** Step 7 (Atlas scope) is his to open.
- 2026-10-09, later — the layered view's audience named: management, not the engineer
  ("the nodes can be larger, the layers can be more defined, almost like horizontal
  swimlanes (but not exactly swimlanes)"). Position taken and ratified ("yes, write it into
  the spec"): the layered strategy *is* that picture, no second mode. `layered-view.md` §10:
  cards with names in words, full-width bands with the label once, planes as columns over
  them, one heavier line per pair, edge-to-edge endpoints, crossings routed along the gap
  below the bands. Placement untouched. Spec only; the round stays shelved until he opens it.
- 2026-10-09, latest — "follow your lean, unless it is a pivotal decision. go" → §10 built:
  `layered-view.mjs` rewritten as cards, bands, planes-as-columns, one routed line per pair;
  placement untouched (17/17); key rows added; verified headless on MyWeb and YourWeb and on
  the Atlas page. The lean taken on the one open item (the key gains rows, no second key).
- 2026-10-09, last — "so how do we address the 'honest gap'?" → the register's lines lifted
  into `layered-lines.mjs` (pure) with `tests/Test-LayeredLines.mjs` 16/16; the YourWeb shot
  byte-identical before and after. Nothing is drawn without a pin now.
- 2026-10-09, evening — item 8, the cross-cutting concern (AppTrak in every site's graph):
  position taken (a `crossCutting` flag on the registry card, a fold into one capsule per
  stage, never a hide, nothing inferred from counts), "go" → built as
  `cross-cutting-systems.md`: the fold in the graph controller reusing the canonical merge,
  the Services switch, the capsule shape, the Services band, the card's badge / suggestion /
  checkbox; the Telemetry + LOGBOX fixture; Test-StageCrossings re-pinned 25/25, placement
  19/19; six headless shots. Three calls logged. The step-7 discussion is closed.
- 2026-10-09, close — "write a little set of instructions … and then push": `.docs/after-pull-2026-10-09.md`
  (lookups once, question 14, AppTrak cross-cutting, canonical names then Layered, where
  each note landed, what was not timed). **Pushed to origin/main** on his word, twenty commits.
