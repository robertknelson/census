---
# ── the app reads exactly these; everything else is yours ──
summary: "The board says so when the stage list has no order, and chips name their stage; committed, not pushed"
resume: "start-census.bat for Census; apptrak/Invoke-AppTrakDemo.ps1 for the local AppTrak; tests/Test-MoveItQuestions.ps1 checks every Move It rule; Move It at /moveit/division, /moveit/week, /moveit/calendar"
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

**The board tells you when it cannot rank the stages.** On the real server every stage
column had merged into one and releases already in production were flagged late. The cause
is a missing order on the stage list in the tracking database, which Census reads and never
writes. The board now says so in a line above the lanes instead of drawing a merged column
as if it meant something, and it never changes its guess between loads.

**A chip says where it is in words.** In a column shared by two stages it reads *31 days in
UAT*. At the top it reads *shipped Aug 20* instead of *48 days here*, and after two weeks it
leaves the columns for a *Shipped* list under the application, as whole releases already
did. The *to PROD* number works whatever case the stage names are in.

## What's next

**One SQL statement, yours.** Set the order on the four stage rows in the tracking database
(`.docs/move-it-round-2026-10-07.md` has it, with a look-first query). Then pull, reload the
board, and bring back anything that still reads wrong.

**Then the rest of the Oct 1 round,** and in Census, Triage's unresolved addresses.

**Still owed:** Traffic waits on the DMZ facts; the registry tables for the
application-level screen.

## Anything alarming

- **Speed on real data is still unmeasured** for the Move It pages added last round.
- **The board still has places to type** and must be gated before anyone but him gets
  a link.
- **This slice is committed but not pushed.** Say push.
- **Web-address matching is exact** (plus wildcard site names). A real estate full of DNS
  aliases may resolve less than the demo did; the Triage list will say how much.
- **Traffic has a naming risk** (MOVEit, the product, versus Move It).
