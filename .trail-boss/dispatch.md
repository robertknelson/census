---
# ── the app reads exactly these; everything else is yours ──
summary: "Atlas flags cross-stage calls and draws systems as layered stage planes; committed, not pushed"
resume: "start-census.bat for Census; apptrak/Invoke-AppTrakDemo.ps1 for the local AppTrak; tests/Test-MoveItQuestions.ps1 checks every Move It rule; tests/Test-StageCrossings.ps1 checks the stage-crossing readings against a running demo; Move It at /moveit/division, /moveit/features, /moveit/releases, /moveit/calendar; Move It pages need the Development profile locally"
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

**Atlas can draw a system the way the old architecture diagrams did.** Pick *Layered* and
each stage becomes a panel, dev through prod, with three rows on every panel: the browser
(a triangle over each web app), the server, and the data. Downstream services sit in a
strip to the right. The same thing keeps the same column on every panel, so you read a
database straight across the stages. A cross-stage call is a red line reaching from one
panel into another. An application nobody has placed yet sits in an *unplaced* row until
someone picks web, spa or api for it in Triage. (Later today.)

**Atlas now notices when a site calls a service in the wrong stage.** This morning's find,
a production site configured for over a year against a development service, is exactly the
thing it looks for: any connection whose two ends share no stage. The line draws in red on
every Atlas tab whatever the filter, the inspector says it in words (*MyWeb · prod →
yourweb.dev · dev — crossing, down*), and a finding lands on the machine where the
configuration file lives, which is where the fix is. When a crossing is meant, one click
accepts it with your name and a note; it stays drawn, muted, and leaves the findings.
Hosting and blast radius carry the same word, the registry panel counts them per system,
and connections Census cannot judge yet, because one end has no stage tagged, are counted
as *unjudged* rather than passed quietly.

**Not built yet, deliberately:** the layered architecture picture (user interface over
gateway over database, peers to the side). It needs someone to say which layer each
application sits in, and it would not have caught this on its own.

## What's next

**Pull and look at the real estate in Atlas.** Tag the site and the service if they are
not tagged yet; the edge should read *crossing, down* and the finding should sit on the
site's machine. Accept the crossings that are meant.

**Tag one real system's applications** (web, spa or api, in Triage), open it Layered, and
bring back what reads wrong — he wants to refine the flat picture first. The 3D version
is parked until then.

**Then the Move It round:** one SQL statement, yours, then the nine steps in
`.docs/move-it-round-2026-10-07.md` on your real data.

**Then the rest of the Oct 1 round,** and in Census, Triage's unresolved addresses.

**Still owed:** Traffic waits on the DMZ facts; the registry tables for the
application-level screen.

## Anything alarming

- **A crossing is only as good as the tags.** An untagged downstream service is judged on
  its machine's stage when the machine has one, and otherwise sits in the *unjudged* count.
  That count is the honest size of the blind spot.
- **Speed on real data is still unmeasured** for the Move It pages added last round.
- **The board still has places to type** and must be gated before anyone but him gets
  a link.
- **Web-address matching is exact** (plus wildcard site names). A real estate full of DNS
  aliases may resolve less than the demo did; the Triage list will say how much.
- **Traffic has a naming risk** (MOVEit, the product, versus Move It).
