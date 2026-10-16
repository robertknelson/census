# The day — what changed, and did any of it matter

> Spec 2026-10-14, from Robert's first week on the real estate with the From → To window:
> *"we need a new top level concept, a Calendar onto which we can add the very very
> interesting daily deltas … the client will want to simply first hit a DAY VIEW, to see the
> deltas, to know 1) the current state and 2) what changed."* Position taken in conversation,
> his "go" the same day. Status: **slices 1–3 built 2026-10-14 / 10-15** (§11).

## 1. The question

Every surface so far slices the estate by a tab: machines, software, hosting, certificates,
changes. A reader who opens Census in the morning does not want a slice. They want the day:
what changed since the last look, how much of the fleet that touches, and whether any of it
matters. The current state already exists one click away. The deltas exist too (the Changes
panel, `census-web.md`) but as a per-machine stream with no headline, no count, no sense of
how many machines were quiet and how many were not even looked at.

## 2. Position

- **The landing is Today.** The most recent collected day, every machine's delta against its
  previous snapshot. The month grid is navigation, not the destination: a client clicks a day,
  or sets a range, and gets one page that answers "what changed, and did it matter?"
- **A machine calendar, not a second application calendar.** Move It's Calendar (`move-it.md`
  §21) is applications, releases and stages. This one is machines and snapshots. They share
  the grid's look; the join (a Census delta on PRODWEBBOX the same day a release was asserted
  to PROD) is the follow-on, §11 slice 4.
- **A projection, not a second engine.** Everything on the page is the existing
  `DiffEngine` output plus, in later slices, a diff of the findings stream between two days.
  No new fact is computed that the Changes panel could not.
- **Read-only, no lifecycle.** No acknowledge, snooze or dismiss on a delta. The 2026-07-31
  ruling on findings holds here for the same reason: the page is raw truth, recomputed every
  read.

## 3. The unit of time

**A day, for a machine**, is that machine's snapshot on the day against its previous snapshot,
whatever date that was. A machine collected Monday and Thursday has a Thursday delta that
spans three days; the row says so (*Mon 27 → Thu 30*).

| Status on a day | Meaning |
|---|---|
| `changed` | collected that day, and the diff against the previous snapshot is not empty |
| `quiet` | collected that day, diff empty |
| `first-seen` | collected that day, no earlier snapshot — nothing to compare, and that is news |
| `not-collected` | in the universe, no snapshot that day |

**A range From → To** compares each machine's first collected day in the range against its
last (the Changes panel's original window rule; since 2026-10-16 that panel walks every night
inside its window to date each line, so a change that came and went inside the range is two
lines there and nothing here — an open item below). Statuses: `changed`, `quiet`, `collected-once` (one
snapshot in the range, nothing to compare), `not-collected`.

**The universe** is what the collector is meant to visit: every configured machine
(`machines.json`, including `expected: false` — absence is signal, and a decommissioned box
that is suddenly collected is exactly the kind of thing the page is for) plus every machine
directory ever collected. Not the canvas's wider universe: a name that exists only as an
assertion in `assets.json` or the entity tags is a *dangling assertion* finding, not a machine
nobody collected, and *not collected* must mean "the collector should have, and did not".

**Default** is the latest fleet date (`CensusStore.GetFleetDates()` newest). Not "the most
recent day with a change": a quiet latest day is a statement the reader should see, and the
grid shows where the last change was. Call logged in `calls-made-for-you.md`.

## 4. The headline

Three counts, always, in this order: **changed · quiet · not collected**, with **first seen**
(or **collected once** in a range) appearing only when non-zero. They sum to the universe
after the filters (§7). Each is a button; pressed, it lists its machines below, because "which
three were not collected?" is the first follow-up.

A quiet day and a broken collector must never look alike. On the grid a day nobody collected
is hatched, the way Move It's Calendar hatches days not yet backfilled; the headline on such
a day reads *nobody was collected*.

## 5. Events, not rows

The feed is per machine, per section. The same patch on fourteen machines is fourteen rows.
On the day page it is one **event**: identical section, kind and text across machines on the
same day collapse to one line with the count and the machines behind it, most machines first.
A row still reads exactly as the Changes panel prints it (`+`, `−`, `~`, the section, the
text), so nothing learned there is unlearned here.

One exception, his call 2026-10-15: a drive whose only change is its free space
(`C: System: percentFree 45.0 → 42.0`) is **drift**, and every drift on the day folds into one
Platform line, *free space drifted on N drives*, with the machines behind it. Every box drifts a
little every day; on a fleet the raw rows would bury the page. A drive that also changed health
keeps its own row, and the raw rows stay in the Changes panel. The API marks the row
(`drift`, set where the rows are flattened: a `drives` change whose only field is
`percentFree`), and **drift alone does not make a machine changed**: a machine whose only rows
are drift reads *quiet* in the headline and does not shade the grid, but keeps its rows, so
the fold still names it. Built 2026-10-15 the same day as the fold, rather than waited for:
on a real fleet every box drifts every day, and a headline that counted it would say nothing.

## 5a. What it means — findings born and cleared

Above the four groups, a fifth heading, **What it means**: the findings stream
(`FindingsEngine.Compute(asOf)`, census-web-v2-ux.md §4) as of the day against as of the day
before. A finding in the later and not the earlier is **born**; the reverse is **cleared**.
No new severity is invented and no finding is computed that `/api/findings` would not; the
page only says which ones appeared and which went away.

**Identity.** Titles drift — *expires in 15d* is *expires in 14d* tomorrow — so a finding
carries a `key`: kind, machine and the thing found (a certificate's thumbprint, the OS build
line for patch drift, the identity label for a clone; `""` when the kind is one per machine;
the title otherwise). Two findings with one key are one. The key is on `/api/findings` too,
where nothing reads it yet.

**The day before** is the calendar day before, not the previous fleet collection: a finding
that depends on a snapshot cannot change between collections anyway, and one that depends on
the clock (a certificate crossing thirty days, a machine going stale) crosses on a calendar
day whether anyone collected or not. A range diffs as of To against as of From, the same
exclusion of From's own day as the events have.

**Rendered** like the events: the same finding on several machines is one row with the
machines behind it; severity first (critical, high, medium, low), born before cleared within
a severity, then most machines. Each row says *born* or *cleared* as a word and the severity
as a word, never a colour alone; the detail line is shown when the row is one machine, since
collapsed rows have one detail each. The stage chips and the machine scope apply by the
finding's machine, so a first-seen box with no events still shows its findings born.

## 5b. Expected or not

An installed-software event carries a word, judged against the machine's approved baseline
(`approved-baseline.md`) on the row's own two snapshots:

| Event | Word | Because |
|---|---|---|
| added, and the approved set covers it | **expected** | it moved the machine toward its baseline |
| added, and it lands as a deviation | **unexpected** | it moved the machine away |
| removed, and it was required | **unexpected** | the machine is now missing something explicit |
| removed, and it was a deviation | **expected** | somebody cleaned up |

Nothing is said — no word at all — when the machine is outside every baseline, when its
software could not be judged (the baseline's own honesty rule), when the row is a servicing
row (`systemComponent`, which the baseline does not compare), when an approved-but-optional
item is removed, or on a version change: the baseline keys on name, architecture and scope,
never version (approved-baseline.md §6). Other sections carry no word; the baseline has no
opinion on an IIS site or a certificate.

The word is drawn as a word, *unexpected* in the amber the page already uses for *changed*,
with the reason on hover. The same item expected on one machine and a deviation on another is
two events, not one. The Changes panel's rows never carry the word; the judgement is the
day's, as a projection, and the API field (`expectation`) is null on the fleet feed.

## 6. Grouped by meaning

The diff sections fold into four headings a manager reads. Dev-ops still sees the section
name on every line.

| Group | Sections |
|---|---|
| **Deployments** — what someone shipped | `iisSites`, `iisAppPools`, `iisApplications`, `iisDependencies`, `dotnetCoreRuntimes`, `dotnetSdks`, `roles` |
| **Platform** — what operations did to the box | `os` (build, pending reboot), `drives`, `apps` (installed software) |
| **Security** | `certificates` |
| **Data** | `sqlInstances`, `sqlDatabases`, `sqlDatabaseFiles` |

Installed software sits under Platform, not Deployments: on this estate an MSI landing is a
patch or an agent far more often than an application release, and IIS carries the releases.
A group with no events is not drawn. Order fixed as above: deployments are the news.

## 7. Filters

**Stage** chips, the Estate's rule exactly (`estate-page.mjs` `stageMatches`): the effective
stage from `/api/canvas` (`derived-machine-stage.md` §2), chips in the configured order, *all*
first, several at once, and a machine with no stage is never hidden by a stage filter.

**Machine** scope: every machine name on the page is a button; pressing one scopes the day to
that machine, the scope line names it, offers *open in Estate ↗* (the Estate's details panel
for that machine and day, `/#machine=X&day=D`) and ×. One machine at a time: the question is
"what happened to this box", and the Estate is the place to compare several.

The URL carries all of it (`?day=` or `?from=&to=`, `&stages=`, `&machine=`), so a day is a
link that can be pasted.

## 8. The page

Route **`/day`**, its own view, JS tree (`wwwroot/js/day/`) and stylesheet (`day.css`), apart
from the Estate SPA the way Atlas and Move It are: same stores underneath. Header: wordmark
*Census / the day*, links to Estate, Atlas and Move It.

Left, the **month grid**: Sunday to Saturday, ‹ › by month, today marked, each day shaded by
how many machines changed on it (relative to the month's busiest day), hatched when nobody was
collected, the chosen day or range outlined. Under it, From and To inputs and *Latest*.

Right, **the day**: the date as the title (or *From → To*), the stage chips, the headline
(§4), then the groups (§6) with their events (§5). Machine names as in §7.

Nothing here is written to disk. The page needs no setting; the grid's cost is the one thing
to watch (§12).

## 9. Not doing

- No acknowledge / dismiss / seen-it (§2).
- No second diff engine, no stored daily summaries. If the month grid is too slow on the real
  fleet, the fix is a cache keyed on `(machine, date)` in front of `DiffEngine`, not a new
  truth (§12).
- No link from a Census delta to a Move It release yet (§11 slice 4).
- Not the landing (`/`) yet — §12.

## 10. API

```
GET /api/day                       the latest fleet date
GET /api/day?day=YYYY-MM-DD        one day
GET /api/day?from=…&to=…           a range (the Changes panel's window rule)
  → { day, from, to, machines: [ { machine, status, fromDate, toDate, entries: [ { section, kind, text, expectation, drift } ] } ],
      findings: { before, asOf, born: [ FindingDto ], cleared: [ FindingDto ] } }

GET /api/day/month?month=YYYY-MM   per collected day: { day, collected, changed }
```

`entries` is the Changes panel's shape (`ChangeEntryDto`), flattened by the same code
(`ChangeEntries.Flatten`, lifted out of `ChangesController` behaviour-preserving). The month
endpoint diffs every snapshot in the month against its predecessor: roughly *machines × days*
diffs, machines walked in parallel.

**Cost, measured 2026-10-15** on synthetic trees (the demo WEB01 snapshot varied per machine
and day: drives drifting, a patch landing mid-month, software coming and going, certificates
crossing thirty days; 5 % of machine-days not collected), on the laptop:

| Fleet | Request | Before | After, cold | After, warm |
|---|---|---|---|---|
| 60 × 30 days | a day | 0.3 s | — | — |
| 60 × 30 days | the month | 1.4 s | — | — |
| 150 × 30 days | a day | 0.9 s | 0.5 s | 0.3 s |
| 150 × 30 days | a range | 0.5 s | — | 0.3 s |
| 150 × 30 days | the month | 1.9 s | 0.9 s | 0.2–0.5 s |

The cost was file reads, not diffs: a day request reads every machine's snapshot several
times over (two findings computes, each with its own fleet baseline pass, then the rows),
and the month reads every snapshot in it twice. **The fix is one level below the one §12
named:** parsed snapshots are cached in `CensusStore` behind its one read method, keyed on
path, length and last-write time so a rewritten file reads fresh on the next request
(proved: a snapshot rewritten under the running app showed its new row at once), bounded by
`Census:SnapshotCacheEntries` (1000) with a sliding `Census:SnapshotCacheMinutes` (10). Every
surface that reads snapshots benefits; no truth is stored. The month loop runs machines in
parallel. Not a `(machine, date)` diff cache: that would be a second place a diff could be
wrong, and the reads were the cost.

## 11. Slices

1. **Built 2026-10-14.** Headline, collapsed events in four groups, month grid with shading,
   stage and machine filters, range, deep link to the Estate. `tests/Test-Day.ps1` against
   the running demo; `tests/Test-DayEvents.mjs` for the pure grouping and collapse.
2. **Built 2026-10-15.** Findings born and cleared (§5a): `FindingsEngine.Compute(asOf)`
   diffed by key between the day and the day before (a range: To against From), the fifth
   heading *What it means* above the four groups, severity-ordered, the fold of drive
   free-space drift (§5) in the same slice.
3. **Built 2026-10-15.** Expected or not (§5b): installed-software events judged against
   the machine's approved baseline on the row's own two snapshots, a word on the line, silent
   where the baseline has no opinion.
4. **The Move It join.** A deployment event on a machine the same day a release was asserted
   to that stage reads *matches release X*; one matching nothing is unexpected. Rule 1 of
   `move-it.md`: observed and asserted never drawn alike. Needs machine → application
   mapping solid on real data first.
5. **Landing.** Whether `/` becomes the day. His call after a week on it.

## 12. Open items

| Item | Needs |
|---|---|
| Make `/day` the landing page | A week of his use. The Estate stays at `/` until he says. |
| Cost on the real fleet | Measured synthetically to 150 machines (§10); the real fleet's snapshots are larger (hundreds of apps), so the cache's memory per entry is larger too. If the month grid is slow there, raise `SnapshotCacheEntries` first; a `(machine, date)` diff cache is the step after. |
| Demo fixtures hold three days (07-30, 07-31, 08-01) | A week of generated snapshots so the grid has shading to show. `tests/New-DemoStageTopology.ps1` is the place (it already writes whole envelopes per day; LOGBOX's third day was added there 2026-10-15). |
| `expected: false` machines in *not collected* | Counted today (the canvas draws them as ghosts too). If the count reads as noise on the real estate, a *decommissioned* bucket is the fix, not dropping them. |
| *Added as a deviation → unexpected* has no demo fixture | Three of the four judgements (§5b) are pinned by `Test-Day.ps1` on WEB01's 07-30 → 07-31 (approved-baseline.md §12); the fourth needs a machine with two snapshots that deviates on its later one, and every such machine is clean by design (the stage-topology fixture's "baseline noise is zero"). Pinned by node tests and the 2026-10-15 scratch probe. A fixture when one earns its place. |
| Range semantics vs day semantics | A range compares first-in-window to last-in-window; a day compares to the previous snapshot whatever its date. Said on every row; revisit if a reader trips. |
| Range here vs the Changes panel's window (2026-10-16) | The Changes panel now walks every night in its window to date each line, so a change that came and went inside the window is two lines there and *quiet* here. Fine while the day's statuses are per machine; if his read of a range trips on it, the fix is a nightly walk here too (a machine is *changed* if any night in the range was, less drift). |

## 13. Verification log

| Date | What |
|---|---|
| 2026-10-15 | Drift in the API + fixtures: `ChangeEntryDto.Drift` set in `ChangeEntries.Flatten`; the day's status and the month's count ignore drift rows. WEB01's 07-30 snapshot now carries the AV and an unapproved editor and lacks URL Rewrite (both encodings rewritten, byte-equal), so 07-31 judges three rows; LOGBOX has an 08-01 snapshot with nothing but free space moving (`New-DemoStageTopology.ps1`, re-run byte-identical for every other file). `Test-Day.ps1` 48/48 (LOGBOX quiet with its drift row kept; August 2 collected / 1 changed; nine drift rows on 07-31 and every changed machine has a non-drift row; 16 born / 15 cleared with the AV's absence born and the editor's finding cleared; the three words); stage crossings 25/25, Move It 33/33, credentials 42/42, node 74/74. In Chrome: the default day reads *1 changed · 1 quiet · 15 not collected*, the Platform fold names BUILDSRV01 and LOGBOX; on 07-31 the three words sit on WEB01's rows. No console errors. |
| 2026-10-15 | Cost: synthetic trees of 60 and 150 machines × 30 days served with `Census__RootPath` on a second port, timed with curl before and after the snapshot cache and the parallel month (table in §10); a snapshot rewritten under the running app read fresh; `Test-Day.ps1` 37/37 and `Test-StageCrossings.ps1` on the demo afterwards. |
| 2026-10-15 | The way in: *The day* as a quiet link first among the Estate's header actions, before *as of*; clicked in Chrome, lands on `/day`. |
| 2026-10-15 | Slice 3: `dotnet build` clean; `node tests/Test-DayEvents.mjs` 32/32; `tests/Test-Day.ps1` 37/37 (the demo's one added app is a servicing row, pinned as *not judged*; the Changes panel pinned as never judging). The demo has no judgeable install, so a scratch copy of the demo tree with four planted rows on WEB01 was served on a second port: Wireshark added → *unexpected*, URL Rewrite 2.1 added → *expected* (web-prod approves it), Symantec removed → *unexpected* (required), 7-Zip removed → *expected* (was a deviation), the servicing row silent; the words on the lines in Chrome. No console errors. |
| 2026-10-15 | Slice 2: `dotnet build` clean; `node tests/Test-DayEvents.mjs` 28/28; `tests/Test-Day.ps1` 33/33; in Chrome on 2026-07-31 the *What it means* section (11 born · 5 cleared on 14 machines): two critical prohibited-software rows first, *Never successfully collected* cleared on the five first-seen boxes as one row, *Behind fleet patch level* cleared on six as one row, the detail line on single-machine rows; APPSRV01 pressed — first seen, no events, its six findings born and one cleared listed. No console errors. |
| 2026-10-15 | Drift fold: `node tests/Test-DayEvents.mjs` 23/23; in Chrome on 2026-07-31 the Platform group went from 15 events to 7, one line *Drives: free space drifted on 9 drives* on 9 machines with *+4 more*, the os.build event unchanged beneath it. No console errors. |
| 2026-10-14 | Slice 1: `dotnet build` clean; `node tests/Test-DayEvents.mjs` 16/16; `tests/Test-Day.ps1` 24/24 against the Demo profile; in Chrome: the default day (08-01, one changed, sixteen not collected), 2026-07-31 (ten changed, five first seen, two not collected, the Deployments and Platform groups), the *not collected* list opened, a chip scoping to DCBACKUP01 then a grid click to 07-30 keeping the scope, `stages=prod`, the 07-30 → 08-01 range (collected once appears), *open in Estate* landing on WEB01's details with the 07-30 → 07-31 comparison. No console errors. |
