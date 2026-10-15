---
# ── the app reads exactly these; everything else is yours ──
summary: "LOCAL, NOT PUSHED (2026-10-15): day page — drift discounted, meanings, expected-or-not, cache, fixtures; say push, pull, open /day"
resume: "start-census.bat for Census; apptrak/Invoke-AppTrakDemo.ps1 for the local AppTrak; on the real AppTrak run apptrak/sql/003-lookups.sql then apptrak/sql/004-link-kinds-kebab.sql once; tests/Test-MoveItQuestions.ps1 checks every Move It rule; tests/Test-StageCrossings.ps1 checks the stage-crossing readings against a running demo; Move It at /moveit/division, /moveit/features, /moveit/releases, /moveit/calendar; Move It pages need the Development profile locally"
health: green
links:
  - { label: "GitHub", url: "https://github.com/robertknelson/census" }
  - { label: "Credential setup runbook", url: "https://claude.ai/code/artifact/7b9ba51c-5c67-44d7-9795-11f1f19865b4" }
  - { label: "Move It discovery note", url: "https://github.com/robertknelson/census/blob/main/.docs/features/move-it.md" }
  - { label: "Traffic discovery note", url: "https://github.com/robertknelson/census/blob/main/.docs/features/traffic.md" }
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

**The day page now says what the changes mean — built, checked, committed 2026-10-15,
waiting on your "push".** Above the four groups a new heading, *What it means*, lists the
findings that appeared on the day and the ones that went away: a certificate crossing its
warning line, a machine falling behind the fleet's patch level, a pending reboot clearing, a
box collected for the first time no longer "never collected". Worst first, the same finding
on several machines one line. Below it, each installed-software change carries a word:
*expected* when the approved baseline for that machine covers it, *unexpected* when it lands
as a deviation or removes something required; nothing is said where the baseline has no
opinion. And the Estate's header now has *The day* on it, so there is a way in.

**Disk-space drift is one line now, and does not count — same batch.** A drive whose only
change is its free space no longer gets a row of its own on the day page; every such drive on
the day folds into one line under Platform, *free space drifted on N drives*, with the
machines behind it. A machine on which nothing else happened reads *quiet*, not *changed*,
so the headline and the calendar count the news and not the weather. A drive whose health
changed still gets its own row, and the full Changes panel still lists every drive. The demo
tree now has a day on which one box did nothing but drift, and WEB01's first day now carries
software the baseline has an opinion about, so the suites pin the words.

**Before that, pushed 2026-10-14:**

**A page for the day — built, checked, pushed 2026-10-14.** Open `/day` and it shows the most
recent collected day: how many machines changed, how many were quiet, how many nobody
collected (hatched on the calendar so a quiet day and a broken collector never look alike).
The same change on many machines is one line with the machines behind it, and the lines sit
under four headings — Deployments, Platform, Security, Data. Click a day on the month grid,
or set From and To; filter by stage; press a machine's name to see only it, then *open in
Estate* for its full detail. Nothing to configure, nothing written. The spec names what comes
next: what the changes *mean* (findings born and cleared), whether they were expected, and the
link to Move It's releases.

**Before that, pushed 2026-10-14:**

**Five things you asked for while using it, each built and checked, pushed 2026-10-14.** Until that push the live build was five slices behind, which is why Changes showed only yesterday-vs-today and the details panel had no layer row.

- **Fleet changes has a From and To.** Leave them empty and it is the old feed: each
  machine's latest collection against the one before. Set both and each machine is compared
  on its first collected day inside those dates against its last. A machine collected only
  once in that span drops out, and every row still says the two days it was compared on.
- **You can name an application's layer from the picture itself.** Click a card that reads
  *untagged* in the layered view and the details panel offers web, spa or api, your name,
  and Save. The card moves into its band at once. That is the one tag Atlas now writes; the
  rest still belong to Triage. Dragging a card onto a band is written down as the follow-on.
- **The application list on the left of Move It takes several at once.** Click to add,
  click again to remove, *All applications* to clear. The header names what is chosen, and
  the choice follows you from page to page.
- **The two link kinds are spelled like everything else now:** *depends-on* and
  *related-to*. Because the tracking database already holds the old spelling, there is a
  one-time script that renames it in place and does nothing if run again.
- **The "why is this not seen" query no longer comes back blank.** Your run returned six
  empty grids because the item number matched nothing, and no page showed the number. Now a
  miss says so and lists the items to pick from, the query takes part of a title instead,
  and the item's detail panel shows its number as *#Id*.

**Before that:** the management-register picture, the cross-cutting fold, and your
twenty-two notes. `.docs/after-pull-2026-10-09.md` has every step to run, in order.

## What's next

**Say push, then pull on the live environment and open /day.** Then, on the real tracking database: run the lookups script, then the rename
script, once each. Run the not-seen query with the #Id from the item's detail and bring
back the answer.

**On the real estate:** mark AppTrak cross-cutting on its card; give one system canonical
names and open it Layered, tagging layers from the details panel as you go; bring back what
reads wrong.

**Then the Move It round:** one SQL statement, yours, then the nine steps in
`.docs/move-it-round-2026-10-07.md`.

**Parked:** drag-drop layer tagging; the 3D view; Traffic (waits on DMZ facts); the
registry tables for the application-level screen.

## Anything alarming

- **Four slices are local only until you say push.** Pull before it and the day page on the
  real fleet is still the 10-14 build: a disk-space line per drive, no *What it means*, no
  expected/unexpected, no link from the Estate.
- **What it means may read as a flood on a real fleet** the first day after a big patch
  (every machine's patch-level finding clearing at once is one line, but every first-seen
  box brings all its findings as born). Watch it; if it buries the page the fix is a fold
  like the drift's, per kind.
- **The rename script must run on the real database** before anyone writes a link with the
  old spelling by hand; the order-violation and ready-to-approve questions read the new
  spelling only.
- **A crossing is only as good as the tags.** An untagged downstream service is judged on
  its machine's stage when the machine has one, and otherwise sits in the *unjudged* count.
- **Speed on real data is still unmeasured** for the Move It pages and for a site graph on
  an AppTrak with hundreds of endpoints. The day page was measured on a synthetic fleet of
  150 machines over a month and brought under a second cold, a third of a second warm; the
  real fleet's snapshots are larger, so the first look there is still the test.
- **The board still has places to type** and must be gated before anyone but him gets
  a link.
- **Web-address matching is exact** (plus wildcard site names). A real estate full of DNS
  aliases may resolve less than the demo did; the Triage list will say how much.
- **Traffic has a naming risk** (MOVEit, the product, versus Move It).
