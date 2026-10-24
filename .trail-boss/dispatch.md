---
# ── the app reads exactly these; everything else is yours ──
summary: "Gatehouse built, not pushed: a :5296 app to port Feature Management, Membership and Logs into your live app"
resume: "Census: start-census.bat (Demo), port 5292. Gatehouse: cd Gatehouse.Web then dotnet run --launch-profile http, port 5296 (first run Gatehouse.Web/setup/Invoke-GatehouseDemo.ps1 after apptrak/Invoke-AppTrakDemo.ps1 and apptrak/Invoke-LogsDemo.ps1); tests: dotnet test Gatehouse.slnx and the node files in Gatehouse.Tests/js; porting: a PORTING.md in each Gatehouse.Web component folder"
health: green
links:
  - { label: "GitHub", url: "https://github.com/robertknelson/census" }
  - { label: "Credential setup runbook", url: "https://claude.ai/code/artifact/7b9ba51c-5c67-44d7-9795-11f1f19865b4" }
  - { label: "Move It discovery note", url: "https://github.com/robertknelson/census/blob/main/.docs/features/move-it.md" }
  - { label: "Traffic discovery note", url: "https://github.com/robertknelson/census/blob/main/.docs/features/traffic.md" }
  - { label: "Personas spec", url: "https://github.com/robertknelson/census/blob/main/.docs/features/personas.md" }
  - { label: "Go-live runbook", url: "https://github.com/robertknelson/census/blob/main/.docs/go-live-personas.md" }
  - { label: "Gatehouse spec", url: "https://github.com/robertknelson/census/blob/main/.docs/features/gatehouse.md" }
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
#
# PORTS: Census listens on 5292; Gatehouse (Gatehouse.Web, a second app in this repo) on 5296.
---

## The latest feature added

**Gatehouse, a second, separate app in this repo, built to be copied piece by piece into your live app** (24 October,
on your laptop, not pushed). It is the live app's shape in miniature: a left sidebar, Windows sign-in, and the
command/query data layer. It holds three pieces, each in its own folder with a porting note:

- **Feature Management:** your FM2280 grid. Switch a page on or off for a role, and the sidebar and the page follow at
  once.
- **Membership:** Census's membership page, plus a new **welcome for people who are not members yet**. They ask to join
  (why, which applications, which role), and an administrator approves or declines on the Membership page.
- **Logs:** Log Explorer, Trace and Usage. They gave exactly the same answers as Census on the demo logs, 27 questions
  out of 27.

Every page is guarded twice, in the sidebar and on the server, and the tests check both.

Earlier (23 October, pushed): Log Explorer, Trace and Usage in Census itself.

## What's next

**Read the five porting notes with me, on paper, against your live app** (the last step of the Gatehouse plan). Then
push.

**Waiting on you:**
- where your live app's roles come from today (two ways set out in the identity note);
- whether to keep deciding a script's result shape from its text (open item G3);
- your look at the live site's IIS sign-in settings.

## Anything alarming

- **Your live app's data handlers may be missing what these pieces need** (real async, long JSON read whole, refusals
  as 404/409). The porting note says how to check, and recommends adding Gatehouse's handlers beside yours so nothing
  that runs today changes.
- **Two new tables go into AppTrak's membership schema** (the change history, and the requests to join). The requests
  table was ratified 24 October.
- **Everything was tested only on manufactured data.**
- Census's own items from 22 October still stand: no sign-in on `/personas`, and the database write grants are not yet
  in its runbook.
