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
value_prop:
scope:

# ── state ──
phase: discovery
next_step: "Deploy this build of Census inside the real AppTrakWeb; name the first real builds from /moveit/history and record events from /moveit/release/{id}. Owed: the missing AppTrak tables as zero-row DDL for level 2; the read-only sidebar view (board and release page without controls) when the nav exists"
standing: underway          # underway|parked|blocked|review — where it sits across the range (docs/STANDING.md)

# ── synthesis ──
themes: []
relates: []
---

## notes

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
