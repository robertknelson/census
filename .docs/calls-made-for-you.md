# Calls made for you

Non-pivotal decisions made without stopping, per the collaboration contract ("make your
best guess and proceed, period"). Newest first. Each entry: the question, the options, the
call, the reason. Reverse any of them by saying so.

## 2026-10-15 — the way in from the Estate

**Where the link sits.** The open item said "a header link on the Estate when he says where".
Options: inside the wordmark (its width is pinned to the rail, so no); a nav of Estate ·
Atlas · Move It · the day like the day page carries (widens the ask to Atlas and Move It,
which have no Estate-side link today either); one quiet link first among the header actions.
Call: the one quiet link, *The day*, before *as of*, styled as a link so it does not read as
a seventh panel button. Move it with a word.

## 2026-10-15 — expected or not (day-view.md §5b), slice 3

**Only installed software is judged.** The spec said "a delta that moves a machine toward its
approved baseline". The baseline is a software set; it has no opinion on IIS, certificates or
drives, so those rows carry no word rather than a guessed one.

**Judged on the row's own two snapshots, not the fleet as-of.** Options: reuse the fleet
evaluation the findings already ran (as of the day and the day before); judge each row on
the exact two envelopes it diffed. Call: the row's own envelopes — the word must agree with
the row beside it, and in a range the fleet as-of From can be an older snapshot than the
row's first-in-range.

**Silence over a guess.** No word on a servicing row, a version change, an optional item
removed, a machine outside every baseline or one whose software could not be judged. A
blank reads as "the baseline has nothing to say", which is true; a word there would be
inference.

**Two events when the expectation differs.** The same item expected on one machine and a
deviation on another is two lines; collapsing them would hide the one that matters.

**Verification by scratch probe.** The demo's only added app is a servicing row, so the
four cases were planted in a scratch copy of the demo tree served on a second port, rather
than editing the fixtures mid-slice. Logged as an open item for the fixtures.

## 2026-10-15 — findings born and cleared (day-view.md §5a), slice 2

**A finding's identity is a key, not its title.** Titles carry numbers that drift (*expires
in 15d*). Call: `key = kind|machine|subject`, subject set where the title drifts — a cert's
thumbprint (a renewal is a new cert, so a new finding), the OS build line for patch drift,
the identity label for a clone, `""` for the kinds that are one per machine (stale, unlogged,
never collected, unapproved, missing). The title elsewhere. Two findings with one key are
one; nothing is inferred from text.

**"The day before" is the calendar day before, not the previous collection.** Options: the
previous fleet date; each machine's previous snapshot date; the calendar day. Call: the
calendar day. Reason: snapshot-based findings cannot change between collections, and the
clock-based ones (a cert crossing thirty days, a stale machine) cross on a calendar day
whether anyone collected or not — a cert going critical on a day nobody collected belongs to
that day. A range is To against From.

**Born before cleared within a severity; the detail only on single-machine rows.** The same
finding on several machines collapses to one row like an event; collapsed rows have one
detail each, so the detail is drawn only when the row is one machine. Severity as a word,
born/cleared as a word; colour follows, never leads.

**The section sits above the four groups, drawn only when non-empty.** A quiet day has no
*What it means* at all rather than an empty box.

## 2026-10-15 — the drift fold (day-view.md §5)

**He ruled "fold"; the questions under it.** *What is drift*: a `drives` row whose only field
is `percentFree`. A row that also changed `healthStatus` is not drift and keeps its own line.
Matched on the row text, since that is what the projection has. *Where the fold lives*: in
the projection (`day-events.mjs`), not the API — the API stays the Changes panel's truth and
the Changes panel keeps every raw row. *What it says*: one Platform line, *free space drifted
on N drives*, N counting drives, the chips counting machines once each. *The headline*: a
drift-only machine still reads *changed* and shades the grid. Reason: "fold" was said of the
events list; discounting the headline changes what *changed* means and is a bigger call, so
it is logged as the open item that replaces this one.

## 2026-10-14 — the day page (day-view.md), slice 1

**Default is the latest fleet date, not the most recent delta.** He said "defaulting to most
recent delta". Options: the newest collected day (quiet or not); the newest day on which any
machine changed. Call: the newest collected day. Reason: a quiet latest day is a statement the
reader should see, and the grid's shading shows at a glance where the last change was. One
line to flip if he meant the other.

**Installed software under Platform, not Deployments.** An MSI landing on this estate is a
patch or an agent far more often than a release; IIS carries the releases. Dev-ops still sees
the section name on the line.

**One machine in scope at a time, by pressing its name.** Options: a machine rail like Move
It's (long on a real fleet); a text filter; press-to-scope. Call: press-to-scope with ×, and
*open in Estate ↗* on the scope line. Reason: the question is "what happened to this box", and
comparing several is the Estate's job.

**`/day` is its own page, `/` stays the Estate.** He said the day "COULD" be the landing. A
landing swap is pivotal; open item, his call after a week on it.

**The day's universe is configured + collected, not the canvas's.** The canvas also draws
names that exist only as assertions (assets.json, entity tags, declared entities) as ghosts.
On the day page those would read *not collected*, which is false: nobody was meant to collect
them. They already surface as the dangling-assertion finding. Test pinned to config ∪ dirs.

**`ChangeEntries.Flatten` lifted out of `ChangesController`.** Twenty lines the day endpoint
needed verbatim; the controller now calls the helper. Behaviour-preserving.

## 2026-10-09 — link-kinds renamed kebab-case (his ruling; reverses the 2026-09-17 "member identifiers unchanged" call)

**Rename in place, not add beside.** 003 is insert-only by contract ("a member that exists
is never changed"), so the rename is a separate one-off, `004-link-kinds-kebab.sql`, that
updates the two lookup rows and every `WorkItemLink.Kind` and is a no-op once run. Option
rejected: a tolerant reader (`Kind IN ('dependsOn', 'depends-on')`) in the questions — two
spellings in the data forever for one find-and-replace saved.

**Question column aliases stay** (`DependsOn`, `DependsOnApp`, `DependsOnStage` in
03-order-violations): they are result-set names the PowerShell pins read, not identifiers.

## 2026-10-09 — Move It rail: several applications

**Rail-wide, not Where is it alone.** He named Where is it. The rail is one component and
the choice is remembered once for every Move It page (move-it.md §26.2), so a set on one
page and a single on the others would either fork the rail or break the carry-over. Call:
the set everywhere; every page scopes to *any of the chosen*.

**A plain click toggles; no Ctrl-click.** Options: click replaces and Ctrl-click adds (the
file-list convention); click toggles and *All applications* resets (the facet convention).
Call: toggle. Reason: it is a filter list with an explicit All, the same gesture the
registers' facets already use, and Ctrl is invisible to a reader who was not told.

**Where a page needs one application** (the Coming up form's preselect, History's New
release): the single chosen one if exactly one is chosen, otherwise none — never the first
of several.

## 2026-10-09 — The layer tagged from the Atlas inspector

**Breaking "Triage keeps the pen" — how far.** Options: (a) the inspector edits the whole
claim (system, stages, canonical name, layer); (b) the layer only; (c) say no and keep the
hop. Call: (b). Reason: triage-workbench.md §7 named panel-hopping as the revisit trigger
and he reported it from the real estate; the layer is the one axis the layered picture
shows and Triage does not, while the other axes already have their home and a second full
editor would mean two bulk gestures to keep honest. The shared leaf-walk
(`entity-tags-edit.mjs`) is lifted out of Triage, not copied, so one writer cannot drift
from the other.

**Inspector first, drag-drop later** (his "or maybe drag drop?"). The row is precise and
verifiable in one slice; a drop on the Browser band cannot say web or spa without a
follow-up, and the layered view has no drag at all today. Logged in layered-view.md §9.

## 2026-10-09 — Fleet changes From → To window

**What a window compares, per machine.** Options: (a) the newest collected day on or before
From against the newest on or before To — the as-of reading, which pulls in a day from
before the window when the machine was not collected on From; (b) the first collected day
inside the window against the last inside it — the window reading. Call: (b). Reason: the
question is "what changed between these days", and a machine that was collected only once
inside the window has nothing to say about that and drops out; (a) would quietly answer a
wider question than the one asked. Either is a one-line change in `ChangesController`.

**Empty inputs keep the old feed** (latest vs the one before) rather than seeding From and
To with the fleet's two newest days: the machines' newest days differ (BUILDSRV01 is a day
ahead of the rest on the demo), so no single pair of dates says what the default feed says.

## 2026-10-09 — his notes round (round-2026-10-09.md)

**Cross-cutting systems (cross-cutting-systems.md), three calls stated in the proposal and
not objected to:** the fold applies under both groupings and unfolding is its own switch
(a grouping is about canonical names, a fold is about another system's role); blast
radius and findings stay flat (the fold is a drawing concern, the audit surfaces read the
composed estate); the capsule id is a JSON array like every node id and acceptances stay
keyed on the inner edge (judged before the fold). **One more made in the build:** a capsule
is per *stage set* (`dev+val` is its own capsule), not per member stage — the simplest
honest key; §7 notes the alternative if the real estate has two-stage endpoints.

**The demo's cross-cutting system is called Telemetry on a box called LOGBOX** rather than
AppTrak: AppTrak is the real tracking database Move It reads, and a fixture carrying its
name would read as real. Same shape — logging and health over http, one site per stage.

**The History list caps "all" rather than caching.** Options: compute every pair on the fly
(a year of nights is a year of gz reads and diffs per click); cache diffs per day pair in
memory; cap. Call: cap at `Census:ChangesNightsMax` (120) newest first, and say so in the
header. Reason: a reader wanting older nights narrows the range; a cache is a slice of its
own if the real estate makes "all" slow inside the cap.

**The chip's due-soon window is a setting**, `MoveIt:DueSoonDays` (7), per the standing
rule that a doubtful number becomes a setting.

**A released build claim is an event, kind `build-released`.** Options: delete the row
silently; keep the row with a `ReleasedAt`; delete and record an event. Call: delete the
`ReleaseBuild` row and write a `ReleaseEvent` with the build and the note. Reason: the table's
contract is "attributions are never deleted here" for the manifest loader; the page's act is
a human decision and belongs on the record where the other human decisions are, and the
location rule keeps answering from whatever claims remain.

**The week page has no Full week | Weekdays segment.** The round note said it would take the
calendar's; it is a rolling seven days ending on a date, not a week grid, so there is nothing
to drop. Noted in move-it.md §29.

## 2026-10-08 — the layered view, built (layered-view.md)

**The picture draws at its natural size and the canvas scrolls sideways,** rather than
fitting the canvas. Options: fit (the first cut — five planes shrank to a strip of
unreadable glyphs); fit the height (the second — one plane filled the screen and the rest
scrolled far); natural size. Call: natural size, slot 132 and row 112 as settings. Reason: a
wide estate is wide; the labels have to be readable or the picture says nothing.

**A Layout segment in the toolbar, not only the builder.** The spec put the choice in the
builder; his four existing tabs could not become layered without rebuilding them. Call:
both. Reason: the grouping segment is right there and the switch is one field on the tab.

**An empty plane is not drawn.** The unstaged plane appeared on every tab as an empty slab.
Call: a plane nobody stands on is dropped. Reason: an empty plane says nothing; the
never-hide rule is about nodes.

**The spa fixture serves YourWeb, not MyWeb.** Tagging `legacy.example.com/` into MyWeb
would have moved the §8 member count from 11 to 12 and broken the crossings test's pin.
Call: YourWeb · prod. Reason: the fixture's job is the glyph and the stem, not the system.

**No arrowheads, no orthogonal routing** on the layered edges: straight centre-to-centre
lines, as the physics view draws. Reason: the rows and planes carry the direction; a
router is a slice of its own if the real estate asks for one.

## 2026-10-08 — stage crossings, built

**A stage outside `Census:StageOrder` makes a crossing `unordered`,** a fifth direction,
rather than `up` by the alphabetical fallback the lists use. Options: treat unnamed as
ranking last (the demo's `ref` would then read "prod calls a higher stage"); say there is no
rank. Call: say so. Reason: a direction the order never stated is a guess, and the finding
title would be wrong in a way that reads confident.

**No arrowhead on a crossing edge** although the spec named one. Reason: the line runs
centre to centre and the target's shape covers its end; a mark nobody can see is a setting
without a use. The stroke colour and width carry it.

**The fixture for "up, derived" uses an untagged database on SQL02** (`Gateway`), a box
`assets.demo.json` asserts prod, rather than tagging anything new: it exercises the
machine-stage fallback with nothing added to the tag files, and keeps OrderPortal's two
unclassified web apps (a §8 fixture) untouched.

**Fixtures went through the generator, both days.** Options: hand-add the two edges to the
latest snapshot files; add them to `New-DemoStageTopology.ps1` and regenerate. Call: the
generator (it is the source of truth and idempotent); both days, so the wound reads as
long-standing like his.

**Hosting and blast radius carry the crossing as words in their existing detail,** not a
new column — their JS renders detail as a tooltip already, and the spec said "a word".

**The acceptance key is the graph's own node id, a JSON array string,** not the
pipe-joined form the spec first sketched. Reason: one id, minted in one place, never a
delimiter a name could break (the NodeId rule).

## 2026-10-08 — stage crossings (stage-crossings.md)

**An unclassified target is judged on its host machine's effective stage, badged derived.**
Options: unjudged until someone tags the target; judge on the machine's effective stage.
Call: the machine's stage, marked derived. Reason: the effective stage is derived from
assertions (derived-machine-stage.md §2), not from names, so it is inside the law; and the
real estate's downstream services are tagged more thinly than its machines, so waiting
on the target tag would leave the wound's own edge unjudged. He said "follow your lean".

**The crossing comparer takes the whole stage set of each end,** across all its
associations, not only the viewed system's. Reason: an application serving two systems at
prod is a prod caller whichever tab you are on; a per-system reading would let the same
edge read differently on two tabs.

**Edge composition lifts out of the graph controller into a shared composer** so the
findings engine can judge estate-wide, rather than the findings engine re-resolving edges
on its own. Reason: the W-3 argument; two resolvers would drift.

## 2026-10-07 — the two registers, built (move-it §28.5)

**Question 13 is fetched whole with the page,** not per click. Options: an endpoint with
`@WorkItemId` and a fetch per story; the whole document once. Call: once. Reason: the step
column needs every row's stage arrivals before any click, and 13 is one query; a parameter
would also mean the first SQL the C# side parameterises on a question file.

**The *where* facet is the lane labels, with no separate *shipped* value.** The spec listed
*shipped*; the top lane *is* shipped on this register (its rows read *shipped <date>*), so a
second value would have been the same rows twice.

**A pill link carries only the pill.** `?pill=late` is enough; the register applies the
pill's facets on load. Reason: the link he sends should read as the question, not as its
plumbing.

**Removed rows hide until the *removed* facet is chosen,** rather than a show-removed toggle.
Reason: one control fewer; the facet's count still says how many there are.

**The Releases register's row is a link to the release page,** not a selection. Reason: §28.4
item 4; the page already is the story.

**The first step's gap is blank when negative.** 13's entry lag can be negative (recorded
after the build was already in DEV, as the fixture's Underwriting rules v2 is); on a step
line *-6d* reads as a mistake. The story column's timing grid still shows the figure.

## 2026-10-07 — the two registers, spec only (move-it §28)

**Facets, sort and page in the browser, over one fetch.** Options: server-side paging with
query parameters on 01 and 02; in the browser. Call: browser. Reason: every Move It page is
one fetch per question and 01 returned 26 rows on the real server; the first design that
needs server paging is the one that sees thousands, and it is not this one.

**Register state in the address bar.** Reason: "the features in UAT that are late" is a
thing he will want to send someone; a link is the cheapest handoff.

**Page size is a setting,** `MoveIt:PageSize`, default 50. Reason: a doubtful number that
could be a setting is one (his 2026-09-04 rule).

**Features and fixes share the register, with a kind pick.** Options: features only; both.
Call: both, tab named *Features*. Reason: the lanes and Division treat them as one
population; a fix you cannot find is the same complaint as a feature you cannot find.

**Removed items are listed, grey, hidden by default.** Reason: a register that forgets is a
board; a register that shows the dead by default is a graveyard.

**The Releases register opens the release page, not a side column.** Reason: that page is
already the full story and carries the one write (delete); duplicating it in a column would
be two places to keep in step.

**+ Coming up on both Features and Where is it.** Reason: hearing about a feature is the
register's first row, and the board's users have learned where the button is.

**Shipped rows never leave the register.** Reason: the lanes fold shipped work to keep the
columns readable (§27); a register's whole point is that nothing leaves it.

## 2026-10-07 — the board on an unordered stage list (move-it §27)

**What a shipped chip says.** Options: *shipped 48 days ago*; *shipped Aug 20*. Call: the
date, as the Releases view's cards already say it. Reason: the complaint was that a day count
reads as "stuck"; a date reads as an event.

**Shipped items leave the items view after `MoveIt:ShippedDays`,** the Releases view's
setting, not a new one. Reason: two retirement ages for one board would need explaining.

**No shipping with one stage lane.** When only one stage has ever been seen (the real
server's early state: DEV endpoints only), nothing counts as the top, so nothing retires as
shipped. Reason: one stage seen says nothing about where PROD is; retiring DEV items as
shipped would be the §17 "unused stage above PROD" error in a new coat.

**The unordered warning draws the board anyway.** Options: refuse to draw; draw and warn.
Call: draw and warn above it. Reason: the chips and their releases are still true facts; only
the ranking is a guess, and the fix is one UPDATE away.

**Tie-break by stage name, not by preferring a stage called PROD.** Reason: guessing which
name is production is the convention-sniffing this project does not do; a deterministic
alphabetical pick plus the warning is honest.

## 2026-10-01 (night, Census) — web addresses resolve through IIS bindings (census-web §13)

**A host name bound on several machines reaches all of them.** Options: treat it as
ambiguous and drop it (H-5's rule for machine names); fan out. Call: fan out, with *a farm
may survive one going down* in the detail. Reason: H-5 drops a name two *machines* claim
because one name cannot be two computers; a host header on two machines is a load-balanced
site, which is a fact, not a conflict.

**localhost means the calling machine.** Reason: exact, not inferred — and it is what made
APPSRV01's :9001 call visible at all.

**No IIS site on the port is *unobserved*, never contradicted.** Reason: a Windows service or
Kestrel listener census cannot see may answer.

**A declared external identifier naming a bound host is flagged as a shadow,** like one
naming a machine; Triage now says *the estate wins* instead of *the machine wins*.

## 2026-10-01 (night, Atlas 2) — closable inspector (system-view §12)

**Selecting reopens a closed inspector.** Options: stay closed until the Inspector button;
reopen on selection. Call: reopen. Reason: your 08-25 call — a click must show its details
without discovering anything first. Closing is for clearing the canvas, not muting clicks.

**One × for both states.** It closes the panel and clears the selection; there is no
separate "clear selection" any more. Reason: two × with different meanings in one panel.

## 2026-10-01 (night, Atlas) — builder form and stage focus (system-view §9–10)

**Builder cards stopped being one big button.** Options: keep click-the-card and add a
separate form; make the card the form. Call: the card is the form (stage chips, name, open).
Cost: a system with no canonical names now takes a click on *Open*, not anywhere on the card.

**Starting stages go into the default tab name** (*MyWeb · prod*), and the toolbar keeps a
builder-given name in step. Reason: two tabs of one system at different stages must read
apart; a typed name is left alone.

**Fade 0.22 → 0.14, bleed 0.45 → 0.32; focus outline 2.6, bold labels, edges 2.8.**
"A bit more" read as about a third more fade; the bleed stays clearly visible because
cross-stage lines are what the filter is for. All four are CSS settings.

**Emphasis only when something is faded.** Reason: an unfiltered view should look exactly as
it did.

## 2026-10-01 (last) — the rail stays live with a panel open (census-web §12.2)

**The class legend and stage bar stay live too, not only the team rail.** Reason: all three
make the board's scope; lifting one would make the other two close the panel.

**A new scope choice clears the panel's "show fleet".** Reason: picking a team asks for
that team; the escape belonged to the scope before.

## 2026-10-01 (latest) — Triage and Findings follow the board's scope (census-web §12.1)

**Findings' owner chips removed.** Options: keep them beside the board scope; remove.
Call: remove. Reason: §12 ruled the rail the one place scope is chosen; two filters that
can disagree is the confusion §12 avoided. Owner badges stay on each row.

**Triage hides external entities while scoped, and counts them.** Options: always show
them; hide silently; hide and say how many. Call: hide and count. Reason: they sit on no
machine, so they are not on the board, but a scoped pile must not read as the whole pile.

**Unresolved endpoints cut on the source machine**, as Hosting cuts dependencies.

**Selection is pruned to the screen on every rescope.** Reason: *Apply to N* writes
config; it must never touch a row the user cannot see.

**The toolbar badges and Export CSV stay fleet-wide.** Reason: the alarm and the audit
evidence should not shrink because a team is picked.

## 2026-10-01 (late night) — the frame on every page (§26.1)

**All five pages in one pass, and the release page with them.** It uses the same tab bar,
so leaving it in the old frame would have been the odd one out.

**Where is it: per-lane counts moved into the board's lane headers.** Options: a numbers line
in the header (too long with the release numbers beside it); the lane heads. Call: lane heads.
Reason: they already name the lanes, so the count sits where the eye already is.

**Short labels in the numbers lines** (*approved, not out*, *to PROD, 7d*), with the full
wording on hover. Reason: at 1366 wide the long labels pushed *+ Coming up* to a second line.

**Coming up became a float-over**, shown only in the items view, as before.

**History keeps a short title** (*Every build seen, newest first*). Reason: it is the
entrant's page, and the line says what the table is; the old tagline is its hover text.

**Division's coverage button counts what the pings watch** (*Pings watch 3 of 5*), amber
when any application is unseen. Reason: §24's point is that a calm page is not a complete
one; the number keeps that on screen with the sentence folded.

**The week's tiles: one row**, smaller numbers. Reason: two rows of tiles were the same
waste of height the pass is removing; the page still prints as before.

**One commit for the pass, not one per page.** The pages share one stylesheet and the
new rail/float-over modules, so per-page commits would not have reverted cleanly.

## 2026-10-01 (night) — the Calendar rail (§26)

**Rail and uber header on the Calendar only.** Options: give all five pages the new frame
now; Calendar only. Call: Calendar only, as you asked. Cost: for now the Calendar's page
bar (thin, dark, across the top) differs from the others' tabs.

**Second pass (your redirect): the rail holds only the applications.** Tabs to a thin
uber header, stage to quiet words in the month header, the key behind a button that floats
it. "Showing" now names only the application (stage reads next to it), × clears it.

**Application stays single-choice, with a find box.** Options: multi-select "my
applications"; single, as today. Call: single. Reason: same behaviour, new place; multi is
an open item.

**One line per chip in the grid** (was up to two). Reason: more entries fit a day; the full
text is on hover and in the day detail.

**The day detail overlays the grid** instead of narrowing it. Cost: it can cover the
weekend columns while open; the detail names its day.

**Collapse is remembered per browser.** Reason: a viewer convenience, not shared state.

**A 28rem floor on the grid.** Below it the grid scrolls instead of squashing days.

## 2026-10-01 (evening) — the four "what are we missing" slices, and the dashboard trend

**Order: fixture check, needs-a-word, coverage, the week** — as recommended and ratified ("yes... go").

**Fixture check is a PowerShell test like the collector tests, not xUnit.** Reason: the rules
live in SQL files run verbatim; the house harness for live checks is `tests/Test-*.ps1`.
It rebuilds the local demo database by default. Assertions name the rule they prove; link
ids are matched by title because they change on every reseed.

**Needs-a-word is derived in the page, not a new query.** Options: a question 14 in SQL; derive
from 01/02/12/events in JS. Call: derive. Reason: every rule it uses already lives in a
question; writing them again in SQL would make two places to change. Cost: the fixture check
cannot see it. Thresholds are settings (`MoveIt:StaleDays` 14, `MoveIt:ComingDays` 60).
It sits on History (the entrant's page), not Division.

**Division's coverage gets its own cheap query.** 11 took 59 s on real data because of the
last-good-ping scan, which the verdict never uses. `board/coverage.sql` is 11's rule without
it; the fixture check asserts the two agree.

**The week is the last seven days, prints, and sends nothing.** Options: Monday–Sunday;
rolling seven days. Call: rolling, ending today. Reason: always current when opened.
Mailing is yours to decide (open item).

**Dashboard trend (your interjection): calendar axis, 30 / 90 / All, labels at peak and latest
only, a machines-collected strip.** Reason in census-web.md §3.1. The y-axis stays total hits
(the chart's name); a per-machine rate is an open item for when collection is uneven.

## 2026-10-01 (latest) — backfill run stamp, hold spans, and the §21 leans

**Stamp in a table, a row per run.** Options: a column on `Deployment` (only changes have
rows, so it says nothing about quiet runs); a one-row watermark (loses history); a row per run.
Call: `moveit.BackfillRun`, in `001`. Reason: it answers when the backfill ran and who ran it,
the one question the calendar could not.

**The run closes its window first.** `@through` is fixed before reading; only pings up to it
are considered. Reason: the stamp then means exactly what it says; later pings wait for the
next run, which is idempotent.

**The backfill and the calendar still work without the table.** Reason: you run scripts by
hand; forgetting to re-run 001 first should not be a trap.

**Holds are bands at the foot of the cell, outside the three-chip limit.** Options: a chip on
each held day (crowds out arrivals); a bar across the week row (a second grid layer); a band
per cell, named where it starts and on Mondays. Call: the band. Reason: reads as a span and
costs the cell nothing.

**Your "go with your lean" on the rest of §21:** deferred views stay deferred, the release
link waits for the gate, first-ping builds stay off, redeploys draw once. Recorded as rulings
in §21.1.

## 2026-10-01 (later) — Calendar built, "go"

**No `@From` / `@To`: one fetch, months paged in the browser.** Options: parameters (the
query runner has none today); a date window in the file; everything once. Call: everything
once. Reason: every board file runs verbatim with no parameters, and the calendar's rows are
fewer than History's, which already loads the whole ledger.

**Days are the reader's clock, not the server's.** Changed from the spec: the browser buckets
by local day, so nothing in SQL has to know a time zone. Same day in practice for you.

**A build already there at an endpoint's first ping did not "arrive".** Options: draw it on
day one; drop it. Call: drop. Reason: on the fixtures it put nine false arrivals on Jul 6, and
on real data every endpoint's first ping would do the same.

**Weeks start Monday.** Reason: work weeks read as one row.

**"Last change recorded", not "recorded through".** The ledger stores changes, not when the
backfill ran, so the line says what it knows and the hatch says *quiet or not yet
backfilled*. The honest fix (the backfill stamps its run) is a schema change: open item.

## 2026-10-01 — Calendar (move-it.md §21), spec only

**Observed date is `DetectedAt`.** Options: `DetectedAt` (our ping saw it), `Deploymentat`
(the pipeline's claim). Call: `DetectedAt`. Reason: §10.1 — ours over theirs; the lag is one
ping interval, invisible at day grain.

**One chip per application, stage and day.** Options: one per deployment row; one per build;
one per application/stage/day. Call: the last, naming the release or counting builds.
Reason: rows are per machine, and DEV would drown *All*.

**Days are server local time.** Reason: the reader's day, not UTC's. *(Built as the reader's browser clock — see above.)*

**Holds are points, not spans; `note` events and Coming items are not drawn.** Reason: spans
in a month grid are real work for v1; notes are noise; Coming has no dates by design (§20).

**Stage filter is one at a time.** Your shape — [All] then stages. Multi-select deferred.

## 2026-09-24 (later) — three small slices, "All three"

**A null build note means "leave it".** Options: a note field on the entry form; a separate
claim-only statement for the form; null = keep in `build-upsert`. Call: null = keep, `''`
clears. Reason: one file, and the loader is import/export now — a manifest that wants a
note gone can say so explicitly. Verified: *Add to* on a claimed build reports *unchanged*
and the note stands.

**Which items survive a deleted release: the ones older than it.** Options: all unbuilt
items revert; only items scheduled from the notebook revert (needs a flag); items recorded
before the release existed revert. Call: recorded-before, derived from `CreatedAt` on both
rows. Reason: an item that predates its release can only have come from the notebook, and
nothing new is stored. Their first build is cleared (the attach was the release's claim)
and their links kept. Verified through the API: a scratch release with one heard item
scheduled in and one typed through it — deleted: 1 reverted to *no release*, 1 gone.
The confirm text was not seen in a browser.

**Seeded items get fixed recorded days.** Day 5 for the sprint items, day 50 for the one
still with the devs. Reason: "days here" in Coming and 13's `entryLag` were "today" on
every reseed.

## 2026-09-24 — Coming, the notebook (move-it.md §20)

**Status word: `no release`.** Options: `heard`, `planned`, `unscheduled`, `no release`.
Call: `no release`, because 01's statuses are plain states of the row (`with the devs`,
`not deployed`, `no evidence`) and that is the state; "heard" claims provenance the row
does not carry. The lane is *Coming*, your word.

**One lane, not two.** *With the developers* renamed *Coming* and holding both no-release
and with-the-devs items, the chip saying which. Reason: both are "before any build", and a
third pre-stage lane would push DEV off the first screen for nothing.

**`Since` for pre-build items is the day recorded.** Before, null for *with the devs*.
Reason: arrival at Coming is when it was written down, and "sat there since June" is the
finding the feature exists for. Division does not read it for those rows.

**The note lives in `Description`.** The column existed and nothing wrote it. No new column.

**Ticking a heard item while naming a build also attaches it.** Reason: naming the build is
the moment it became real; two ticks per line would be clutter. Without a build the tick
only schedules.

**The add line sits on the board, in the items view only.** You asked for it on the
higher-level view. It is the board's first write; named in §20's open items against §15's
"board has no write control", behind the same deferred gate as the release page.

**Delete release still takes scheduled notebook items with it.** Left as the cascade was;
reverting them to *no release* is an open item for when the cascade is gated.

**Verification: API, then headless Edge.** The browser extension was not connected in
this remote session. Every write was exercised over HTTP; then, when you said you could
not look, the pages were rendered with `msedge --headless --screenshot` and a throwaway
harness page mounted the chip detail and the entry form. Screenshots sent to you in the
session. Clicks themselves were not exercised in a browser.

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
