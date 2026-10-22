---
# ── the app reads exactly these; everything else is yours ──
summary: "PUSHED to main 2026-10-22: persona UX at /personas — Tracker, FY views, correct-anything, admin pages"
resume: "start-census.bat for Census (Demo); persona UX needs the Development profile (dotnet run --launch-profile http, then /personas); apptrak/Invoke-AppTrakDemo.ps1 rebuilds the local AppTrak with fm, audits and demo members; going live: .docs/go-live-personas.md, in order; tests: tests/Test-Personas.ps1, Test-Edit.ps1, Test-Membership.ps1, Test-MoveItQuestions.ps1 and the node tests"
health: green
links:
  - { label: "GitHub", url: "https://github.com/robertknelson/census" }
  - { label: "Credential setup runbook", url: "https://claude.ai/code/artifact/7b9ba51c-5c67-44d7-9795-11f1f19865b4" }
  - { label: "Move It discovery note", url: "https://github.com/robertknelson/census/blob/main/.docs/features/move-it.md" }
  - { label: "Traffic discovery note", url: "https://github.com/robertknelson/census/blob/main/.docs/features/traffic.md" }
  - { label: "Personas spec", url: "https://github.com/robertknelson/census/blob/main/.docs/features/personas.md" }
  - { label: "Go-live runbook", url: "https://github.com/robertknelson/census/blob/main/.docs/go-live-personas.md" }
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

**A new way into Census, built beside the old one: `/personas`, pushed to main 2026-10-22.**
You pick who you are (Executive, Product Owner, Tech Lead, Application Administrator, Sys Admin)
and see what that person would see. Who holds which role comes from AppTrak's membership tables;
which role may use which page comes from a feature grid you edit yourself.

- **Everyone lands on the Tracker**, the Division step lines, trimmed to their own applications.
- **Year, Quarter, Month, Week** on your fiscal year (October to September, so this is FY2027):
  what shipped, where the change landed, what is due, what is stuck.
- **Needs you**: every gap waiting on a word, with buttons that settle it.
- **Correct anything**: every release, feature, fix, build claim, link and event in Move It can be
  added, corrected or deleted, and every membership row too. Nothing is lost: each change keeps
  the before and after.
- **Membership and Feature access** pages for you, the Sys Admin.
- **Your thirteen Move It notes** are in too: real application names, folded releases, due dates
  under PROD, plain wording, a page per application.
- Pages lay out across a wide screen instead of stacking down it.

## What's next

**Settle two things, then run it live.** First, restrict who can reach the site (Windows
sign-in, your account only): Census has no sign-in yet, so anyone who reaches `/personas` can
edit everything. Second, give Census's own login write rights on the new tables. Then follow
`.docs/go-live-personas.md` step by step on the real AppTrak and look.

**Waiting on you:** whether the membership history table may live in your membership schema
(P13); the two hand-made local applications (P7); counting declared deployments as moves (P8).

**Parked:** sign-in and real permission checks (P12); scoping the old pages to a member (P10).

## Anything alarming

- **No sign-in.** Until the site is restricted, anyone who reaches it can change Move It and
  membership data. Do not deploy without restricting it.
- **The runbook lacks the database-permission step** (write rights for Census's login on the
  new tables and the Move It tables the edit pages change). Without it every save fails.
- **Everything was tested only on manufactured data.** The live run is the first time it meets
  real rows; speed on real data is still unmeasured.
- **Move It now names applications from `membership.Application`.** Check step 0 of the runbook
  first; if that table is not where Census reads, the Move It pages fail.
- **Traffic still has a naming risk** (MOVEit, the product, versus Move It).
