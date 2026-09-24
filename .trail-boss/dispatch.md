---
# ── the app reads exactly these; everything else is yours ──
summary: "Coming built and seen; three follow-ups landed (note kept, delete returns heard items, seed pinned); 5 commits local"
resume: "start-census.bat for Census; apptrak/Invoke-AppTrakDemo.ps1 then apptrak/Invoke-AppTrakQuestions.ps1 for Move It against the local AppTrak; Division at /moveit/division; the notebook at /moveit?view=items"
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

**A place for what is heard in meetings.** Something said to be coming to
an application can now be written down the moment it is heard, from the
board itself: application, feature or fix, what it is, and where it was
heard. It appears in a new first column called *Coming*, beside work that
has a release but no build yet, and it says how long it has sat there. When
a build carrying it is later named on the History page, it moves right on
its own. The History form now offers those heard items as a pick list when
a release is named, so the notebook feeds the release. Nothing else about
Move It changed: no assignees, no estimates, no priorities. His words: not
Jira.

**Three small follow-ups, on his "All three".** Naming a build no longer
erases the note already on it. Deleting a release entered wrong hands back
any heard items that had been put in it, rather than losing them. The
made-up data now has fixed dates, so what it shows does not drift by the day.

**Under the hood, one small schema change.** A feature no longer has to
belong to a release; it belongs to an application, and the release comes
later. The migration runs in place on the real database and is safe to
re-run.

**Verified through the API and headless Edge.** This was a remote session
and the browser tools were not connected. Every write was exercised, every
question re-run against the made-up data, and the pages were then rendered
headless and screenshotted. The screenshots were sent to him in the session.

## What's next

**Push, then the real server.** A click-through in Edge if he wants one;
then push, and run the schema script on the real server before deploying
the new build.

**Then the real-server round** as before: pull, work through the
checklist (executive tab, History count, daily catch-up job).

**Traffic waits on facts only he can get:** how many DMZs, what runs on
them, whether the logs can be read from where the census runs.

**Still owed from before:** the missing registry tables, which the
application-level screen still waits on.

## Anything alarming

- **The board now has one place to type.** It was the read-only page by
  convention. Accepted for now, as with the release page: he is the only
  viewer until development is complete. It must be gated before anyone
  else gets a link.
- **Deleting a release now hands heard items back to Coming** instead of
  removing them. Items typed through the release still go with it. The
  delete itself is still a stabilization tool to retire or gate later.
- **Traffic has a naming risk.** If the DMZ transfer software turns out to
  be the product called MOVEit, the existing Move It module shares its name.
- **The sign-off step depends on a habit.** If test sign-offs are not
  recorded, every release sits at "in testing" until the client approves.
