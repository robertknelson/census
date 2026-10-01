---
# ── the app reads exactly these; everything else is yours ──
summary: "Pages fit the screen, filters reach every Estate tab, config web addresses find their system; pushed"
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

**Every Move It page now fits the screen.** Feedback from the real server: the pages
were good but buried under stacked header bands, leaving a quarter of the screen for the
content. Each page now has one thin row of page names across the top, one header line of
its own controls, and the list of applications down the left side where it can show
dozens. Secondary things (the key, "needs a word", what the board cannot see, the
"coming up" form) open on click instead of taking a band. The calendar never scrolls.

**Census remembers your filter across its tabs.** Picking a team or a machine type now
narrows Triage and Findings too, as it already did Changes, Software, Hosting and
Certificates, and the filter can be changed while a tab is open.

**A web address in a config file now finds the system it belongs to.** Before, an
address pointing at another of your own sites was either shown as unknown or not shown
at all. Census now matches it against the sites' own bindings, so the diagram shows "this
calls the portal on WEB01, which belongs to Billing", and a server's blast radius
includes the apps that call it by web address.

**Last touches before morning:** web addresses also match wildcard site names
(`*.example.com`); a filtered Findings list can be exported as filtered; on Move It, two
holds on one day share one bar, the chosen application follows you between pages, and the
Division header is slimmer.

**Atlas is tidier.** Choose grouped or every-entity, starting stages and a name when
opening a view; the header reads in parts; the inspector can be closed; the selected tab
is coloured. Stages everywhere read in the real order: dev, val, uat, prod.

## What's next

**Pull and restart on the real server** — code only, no scripts or settings to change.
Then the Move It round (`.docs/move-it-round-2026-10-01.md`), which now also asks
whether the new layout fits your usual screen.

**In Census, look at Triage's unresolved addresses.** Any that are really your own
sites show the next gap: names the sites' bindings do not carry (aliases, load
balancers) or wildcard bindings.

**Still owed:** Traffic waits on the DMZ facts; the registry tables for the
application-level screen.

## Anything alarming

- **Speed on real data is still unmeasured** for the Move It pages added last round.
- **The board still has places to type** and must be gated before anyone but him gets
  a link.
- **Web-address matching is exact** (plus wildcard site names). A real estate full of DNS
  aliases may resolve less than the demo did; the Triage list will say how much.
- **Traffic has a naming risk** (MOVEit, the product, versus Move It).
