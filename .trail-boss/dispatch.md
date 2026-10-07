---
# ── the app reads exactly these; everything else is yours ──
summary: "Two new tabs, Features and Releases, as searchable lists with a story per feature; committed, not pushed"
resume: "start-census.bat for Census; apptrak/Invoke-AppTrakDemo.ps1 for the local AppTrak; tests/Test-MoveItQuestions.ps1 checks every Move It rule; Move It at /moveit/division, /moveit/features, /moveit/releases, /moveit/calendar; Move It pages need the Development profile locally"
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

**Two new tabs: Features and Releases.** Each is a plain list you can search, sort by any
column, narrow with facets that show their counts, and page through. A row of standing
questions sits above the facets, *Late*, *On hold*, *Heard, nothing after 30 days*, *Nothing
recorded*, each one click and each a link you can send. Every feature carries its own small
step line, with the days between steps written in. Click a feature and its whole story opens
down the right: when it was recorded, which release took it, when it reached each stage and
on which build, when it was approved, and how long each leg took. Click a release and its
page opens.

**The board tells you when it cannot rank the stages,** and a chip says where it is in words,
*31 days in UAT* or *shipped Aug 20*. (Earlier today.)

## What's next

**One SQL statement, yours,** then pull and walk the nine steps in
`.docs/move-it-round-2026-10-07.md`: the board, then the two new tabs on your real data.

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
