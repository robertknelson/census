---
# ── the app reads exactly these; everything else is yours ──
summary: "Move It: the where-is-my-feature tracker is designed, its tables and twelve answer-queries built and proven on fixtures; tomorrow it meets the real database"
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

A new thing, not a tweak: **Move It**, the answer to a question the governance reader
keeps asking and nobody can answer quickly — *where is this feature? Still with
the developers, on DEV, being tested, or live?*

The insight that made it small: the tracking site he already runs has been
pinging every application every ten minutes for years, and each answer says
which build is running. So the history of "what went where, when" already
exists. What was missing was a place to write down *what is in each build*
(features and fixes, a few lines per sprint) and *when the client said yes*.
Everything else — where a feature is, how long releases take, what got rolled
back, what skipped testing, what went live without approval, which service
went out ahead of the service it depends on — is worked out from those two
things plus the pings. Nothing is guessed from names; every answer traces to a
measurement or to a person who typed it.

Today it went from a sketch to: the design written down and argued through,
the database tables, the rule that turns pings into a deployment history, a
large fabricated test dataset built to exercise every awkward case (rollbacks,
hotfixes mid-sprint, a server swapped under a running build, apps that report
nothing), and twelve ready-to-run questions — each proven against that data.

## What's next

**Tomorrow morning**, following the step-by-step guide written for it: run a
read-only query against the real database first, then add the new tables and
build the deployment history from years of real pings, then ask the five
questions that need no manual entry yet. Some of those may surface real
findings on day one (an app reporting it is in the wrong environment, a server
pair out of step). He brings back nine specific answers, several of which
settle assumptions the fabricated data had to guess at.

After that: his own change to the tracking site so new deployments are
recorded as they happen, and the first hand-entered release to watch the board
light up.

## Anything alarming

- **Everything is proven against fabricated data only.** That is the standing
  rule of this environment — no real data can come here — and it is said
  plainly everywhere. The real database will teach us things tomorrow.
- **One design rule had to be corrected while building.** The first version
  would have said a shipped feature *vanished* from production the moment a
  hotfix replaced its build. Caught by the test data, fixed, and written down.
  Worth mentioning because it is exactly the kind of thing the fabricated data
  is for, and exactly the kind of thing real data may do again.
- **Two teams' pipelines have no programmatic access.** What is in a build is
  typed by hand, by him alone, for the foreseeable future. The design keeps
  that to a handful of edits per sprint, but the habit has to hold.
- The Census remote login has still never run for real. Unchanged.

Nothing is broken. Build clean, all pushed, working tree clean.
