---
---
# ── the app reads exactly these; everything else is yours ──
summary: "Move It has its first screen: every feature and fix in the column the evidence puts it in, proven on fixtures; the real database is tomorrow"
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

**The board has a first screen.** Move It's question — *where is this feature:
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

**Tomorrow morning, unchanged:** the step-by-step guide against the real
database — a read-only look first, then the new tables and the deployment
history built from years of pings, then the five questions that need no
typing. He brings back nine answers.

**Then the board's second screen, once the missing tables arrive.** He read
the real tracking database's schema tonight and found the copy here lacks
the tables that register applications and endpoints, plus authorization.
The second screen is built on those, so it waits for them, by his call. When
it comes: one application in depth — its releases in order, which build is
on which server, and anything that went out ahead of something it depends on.

## Anything alarming

- **Everything is proven against fabricated data only.** Unchanged, and said
  plainly on every artifact.
- **Two applications have no name.** The tracking site's database holds
  application ids but no registry of names; the board shows "Application 3"
  and "Application 4" rather than guess from labels. Where the registry lives
  is an open item he owns.
- **Census now reads a database for the first time** — only on this one page,
  only when a connection string is configured, and the rest of Census is
  untouched. Worth saying because it was a line the project had never crossed.
- The Census remote login has still never run for real. Unchanged.

Nothing is broken. Build clean; the board verified in the browser against the
fixtures.
