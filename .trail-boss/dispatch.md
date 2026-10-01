---
# ── the app reads exactly these; everything else is yours ──
summary: "Calendar, The week, a to-do of what is unrecorded and a coverage line built and pushed; next: the real-server round"
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

**A calendar, and a one-page summary of the week.** Move It now shows
*when* things happened, not only where they are: a month grid with each
build reaching a stage, every approval and hold, each release's target
date (red when missed), rollbacks, and holds drawn across the days they
lasted. A second new page, *The week*, puts seven days on one printable
sheet — what went live, what moved, what went wrong, what is due — for
people who will never open the board. It sends nothing; he decides who
sees it.

**The board now admits what it does not know.** The catch-up script
stamps each run, so the calendar can say "recorded through Sep 13" and an
empty day before that genuinely means nothing happened. The executive page
says how many applications the board can actually see, and names the ones
it cannot. The History page lists what nobody has recorded yet: releases
past their date with no reason given, releases that went quiet, things
heard months ago and never scheduled.

**A safety net under all of it.** One test script rebuilds the made-up data
and checks every question's answer against what it should be, so a change
that quietly breaks a rule is caught. Proven by breaking one on purpose.

**Census, too:** the dashboard's daily chart no longer falls apart past 30
days — it has 30 / 90 / All, fits any range, and shows how many machines
were collected each day so a thin day does not look like an improvement.

## What's next

**The real-server round** — `.docs/move-it-round-2026-10-01.md`: run the
schema script first (it adds the stamp table), then the catch-up, deploy,
and time every page. Speed on real data is the open question: one of the
older questions took a minute there.

**Traffic waits on facts only he can get:** how many DMZs, what runs on
them, whether the logs can be read from where the census runs.

**Still owed from before:** the missing registry tables, which the
application-level screen still waits on.

## Anything alarming

- **Speed is unmeasured on real data.** History now asks the database nine
  questions per load instead of six; the calendar and the week have never
  run there.
- **The board still has places to type** and must be gated before anyone
  but him gets a link.
- **The deployment catch-up is still by hand** until the live processor
  ships; when it does, it must stamp the same table or the calendar's
  "recorded through" line goes stale.
- **Traffic has a naming risk** (MOVEit, the product, versus Move It).
