---
# ── the app reads exactly these; everything else is yours ──
summary: "History count fixed; value proposition written; Traffic discovery note (the mainframe file seam), 10 open items"
resume: "start-census.bat for Census; apptrak/Invoke-AppTrakDemo.ps1 then apptrak/Invoke-AppTrakQuestions.ps1 for Move It against the local AppTrak; Division at /moveit/division"
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

**The history page counts only the builds that need naming.** Builds that
only ever reached the development server were being counted as unnamed
work, which made the catch-up look bigger than it is. Now the count covers
builds that reached testing or live; development builds can still be named
but no longer nag. Proven on the made-up data: nine to name where it had
said sixteen.

**Two things written down, not built.** First, the one-line reason the
whole project exists, with the argument behind it, so it is not re-argued:
*answers about the estate from evidence, not from asking someone*. Second,
a discovery note for the next idea, called Traffic for now: the files that
go back and forth between the websites and the mainframe. The plan is to
watch them at the one place both sides touch, the transfer servers in the
DMZ, and never to reach into the mainframe itself. The note is a
brainstorm, not a plan; ten questions must be answered before anything is
built, and the first two (how many DMZs, what software runs on them) decide
everything else.

## What's next

**Unchanged: he reviews at home, on the made-up data,** then publishes and
runs the real-server checklist. The history count change rides along.

**Traffic waits on facts only he can get:** how many DMZs, what runs on
them, whether the logs can be read from where the census runs.

**Still owed from before:** the daily catch-up job on the real server; the
missing registry tables, which the application-level screen still waits on.

## Anything alarming

- **Nothing is published yet, on purpose.** Seven changes sit on the
  development laptop until he has looked at them.
- **Traffic has a naming risk.** If the DMZ transfer software turns out to
  be the product called MOVEit, the existing Move It module shares its name
  and will confuse every conversation with the network owners. Decide before
  the name hardens.
- **The sign-off step depends on a habit.** If test sign-offs are not
  recorded, every release sits at "in testing" until the client approves.
- **Anyone with the address can edit.** Accepted for now: he is the only
  viewer until development is complete. It must change before anyone else
  gets a link.
