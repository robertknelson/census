---
# ── the app reads exactly these; everything else is yours ──
summary: "Division built: every release and feature as a step line to live; field fixes done; awaiting his laptop review"
resume: "start-census.bat for Census; apptrak/Invoke-AppTrakDemo.ps1 then apptrak/Invoke-AppTrakQuestions.ps1 for Move It against the local AppTrak; Division at /moveit/division"
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

**Division: the whole division on one page.** A new first tab for the
executive. Across the top, six numbers: releases on the way, went live
recently, waiting on the client's sign-off, signed off and going live, late,
on hold. Below, every project, and under each project every release drawn as
a line of steps — in development, developer testing, validation or user
testing, client sign-off, live. Steps behind it are ticked, the step it is on
is a large ring with a few plain words ("in testing · 14 days", "waiting on
the client", "on hold"), the steps ahead are faint. Under each release, every
feature and fix gets its own thin line on the same columns, so the pieces
read straight down under their release.

It will not flatter: a release that went live with no client sign-off
recorded shows a warning mark at that step instead of a tick, and anything
Team A reports by hand rather than by measurement is drawn dashed and says
"reported, not observed". The sign-off step is never typed in; it follows
from the approvals and test sign-offs recorded on each release.

**Four fixes from using it for real.** The entry form no longer wipes the
release name when a line is added. A wrongly entered release can be deleted
whole while things settle down. One query now returns everything known about
any feature — where it has been, when, how long each step took — filterable
by project and stage. And stages nobody uses no longer clutter the page; that
also fixed a real mistake, where an unused stage listed above live had been
mistaken for live in three of the reports.

All proven against the made-up data only, on the development laptop.

## What's next

**He reviews it at home, on the made-up data.** Adjust whatever reads wrong,
then he publishes the changes himself.

**Then the real server.** A checklist is written for it: bring the deployment
history up to date, enter three or four real releases with at least one test
sign-off and one client approval, look at the Division tab as an executive
would, and time the two heaviest reports. His reaction decides the next round.

**Still owed from before:** the daily catch-up job on the real server; the
history page counting only builds that need naming; the missing registry
tables, which the application-level screen still waits on.

## Anything alarming

- **Nothing is published yet, on purpose.** Five changes sit on the
  development laptop until he has looked at them.
- **The sign-off step depends on a habit.** If test sign-offs are not
  recorded, every release will sit at "in testing" until the client approves.
  Whether the teams will record them is an open question.
- **The Division page has not been timed on real data.** It reads the same
  report every page does, and that report has never run against real entries.
- **Anyone with the address can edit.** Accepted for now: he is the only
  viewer until development is complete. It must change before anyone else
  gets a link.
- **Deleting a release is allowed for now** — the only delete anywhere, kept
  for settling-in, to be removed or locked away afterwards.
- **Two applications still have no name**, until the registry tables arrive.
- The Census remote login has still never run for real. Unchanged.

Nothing is broken. The made-up-data demo runs clean and every new screen was
checked in a browser.
