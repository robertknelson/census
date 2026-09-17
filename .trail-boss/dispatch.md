---
---
# ── the app reads exactly these; everything else is yours ──
summary: "Move It has its way in and its release page: name builds from history, open a release, record approvals and holds, pull or rename items — all proven on fixtures tonight"
resume: "start-census.bat for Census; apptrak/Invoke-AppTrakDemo.ps1 then apptrak/Invoke-AppTrakQuestions.ps1 for Move It against the local AppTrak"
health: green
links:
  - { label: "GitHub", url: "https://github.com/robertknelson/census" }
  - { label: "Credential setup runbook", url: "https://claude.ai/code/artifact/7b9ba51c-5c67-44d7-9795-11f1f19865b4" }
  - { label: "Move It discovery note", url: "https://github.com/robertknelson/census/blob/main/.docs/features/move-it.md" }
phase_suggestion: execution
ignite: start-census.bat
#
# ignite runs blind from the repo root in cmd.exe (`wt -d <dir> cmd /k <command>`),
# so it is a .bat, not PowerShell. Defaults to the DEMO fleet: this repo's real
# output\ tree holds one stale entry, so the real profile renders a near-empty
# estate and a board click would look broken. `start-census.bat real` for the
# real tree.
#
# WHAT THE OWNER WANTS KEPT VISIBLE (asked and answered 2026-08-17):
#   1. the latest feature added
#   2. what's next, if anything
#   3. any alarming issues outstanding
#   ...and in plain English. Keep the three headings below; keep the jargon out.
---

## The latest feature added

**One release in depth, with the human record kept there.** Open any release
from the board or the history and see what is in it and where each piece is,
which builds carry it and where those builds are right now, and every human
event in order. On the same page: record an approval, a sign-off, a hold or a
resume with who did it and when; pull an item with a reason; fix a title.
Nothing is deleted, repeating an entry changes nothing, and a hold recorded
here shows up on the board's numbers the moment the page reloads.

**Earlier tonight: the board has a way in.** A History page lists every build the system ever
saw arrive, newest first, and says which ones nobody has named yet. Click one
and say what was in it: pick or create the release, list the features and
fixes, save. Or start a release for work still with the developers and attach
it to a build later, from the same list. Saving twice changes nothing;
nothing is ever deleted; bad input is refused with reasons. This is the first
time Census writes to the tracking site's database, ratified by the owner
because it is where he will do the work, with one condition kept on record:
the manager's view stays read-only and will get its own place in the
navigation.

**Earlier: releases can be entered from a file.** Until today the only way to tell
the board what is in a release was to type database rows by hand. Now a
release is a small text file: its name, the features and fixes in it, the
builds that carry them, and what the humans did (approved, verified, on
hold). One script loads a folder of them. Running it twice changes nothing;
editing a file and running it again changes only what was edited; it never
deletes, and it says out loud when the database holds something the file no
longer mentions. Every value it writes travels as a parameter, and every kind
and stage is checked against the tracking site's own lists before a single
row is written. Proven on fabricated files; the real ones live outside the
repository, as everything real does.

**Earlier today: the real database has been read, and it agrees with the design.** He ran the
morning guide against the live tracking site: the deployment history the
design predicted is there and reads as the deployments he remembers, the
rollbacks it found are ones he knew about, and the new ledger table filled
from years of pings with no broken links and nothing added on a second pass.
The one script that rewrites data was run twice and changed nothing the
second time, as promised.

Nothing came back but his memory of it, by the rule that nothing leaves that
environment. The report is recorded from that.

**Previously — the board has a first screen.** Move It's question — *where is this feature:
still with the developers, on DEV, being tested, or live?* — now has a page a
manager can open without a guide: one row per application, one column per
stage, every open feature and fix sitting in the column the evidence puts it
in. Above it, the numbers for the weekly meeting: how many items are at each
stage, how many releases are late, on hold, went live this week, or are
waiting for the client's yes. Click an application to see only it; click an
item to see what is known about it and its release. Fixes are drawn dashed,
features solid; anything Team A reports by hand rather than by measurement
says so on the item.

It runs against the fabricated data only, as everything here does. The design
decision underneath it was settled today by a fact rather than a debate: in
the real environment Census already lives inside the tracking site, so the
board is simply a Census page reading the tracking site's own database.

## What's next

**He names the first real builds.** This build of Census goes into the real
environment; he opens the History page and names the recent builds he
remembers, sets up what is in progress, and records the approvals he knows
about on each release's page. That is the first real reading of the board.

**Then the board's third screen, ahead of the second.** The release page and
the work item's trail hang off tables that exist; the second screen still
waits on the registry tables he owes.

**The live half of the ledger is 2–4 weeks out at least.** Until his code
writes the ledger as pings arrive, the backfill script has to be re-run
before any real reading of the board.

**Then the board's second screen, once the missing tables arrive.** He read
the real tracking database's schema tonight and found the copy here lacks
the tables that register applications and endpoints, plus authorization.
The second screen is built on those, so it waits for them, by his call. When
it comes: one application in depth — its releases in order, which build is
on which server, and anything that went out ahead of something it depends on.

## Anything alarming

- **The lookup script had misread the tracking site's lookup table** and
  wrote list names where it should have written list members. No harm done:
  he entered the real rows by hand, and the script is rewritten in the
  table's own shape and can never update an existing row.
- **One question takes a minute on real data.** Not one that is on the board,
  so nothing to do yet; noted for when it is.
- **Census now writes to a database**, on one page, through one endpoint, with
  every value as a parameter and every kind checked against the tracking
  site's own lists. Ratified; said here because it is a line crossed.
- **The file-based entry built today is set aside as the way in.** Not
  wasted: its write rules and statements carry into the page unchanged, and
  it remains the way to move releases between environments.
- **The real environment is now no longer fabricated-only for the SQL side.**
  Census itself is still proven against fabricated data only, and said
  plainly on every artifact.
- **Two applications have no name.** The tracking site's database holds
  application ids but no registry of names; the board shows "Application 3"
  and "Application 4" rather than guess from labels. Where the registry lives
  is an open item he owns.
- **Census now reads a database for the first time** — only on this one page,
  only when a connection string is configured, and the rest of Census is
  untouched. Worth saying because it was a line the project had never crossed.
- The Census remote login has still never run for real. Unchanged.

Nothing is broken. The fixture demo runs clean with the insert-only lookup
script; the board is unchanged since it was verified in the browser.
