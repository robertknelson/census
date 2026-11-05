---
# ── the app reads exactly these; everything else is yours ──
summary: "Census on AppTrak: sign-in, impersonation, owners see their own, settings in AppTrak; local, not pushed"
resume: "Read .docs/features/census-on-apptrak.md (§3.1, §4.1, §5.1, §6.1, §7.1, §10) and .docs/decisions.md. Run: cd Census.Web; dotnet run --launch-profile http (port 5292; needs appsettings.Local.json listing you in Authorization:SystemAdministrators). Tests: tests/Test-Identity, Test-Ownership, Test-Assertions, Test-Reset, Test-Edit, Test-Membership (.ps1) and tests/*.mjs. Next: his four answers under Anything alarming."
health: yellow
links:
  - { label: "GitHub", url: "https://github.com/robertknelson/census" }
  - { label: "Credential setup runbook", url: "https://claude.ai/code/artifact/7b9ba51c-5c67-44d7-9795-11f1f19865b4" }
  - { label: "Move It discovery note", url: "https://github.com/robertknelson/census/blob/main/.docs/features/move-it.md" }
  - { label: "Traffic discovery note", url: "https://github.com/robertknelson/census/blob/main/.docs/features/traffic.md" }
  - { label: "Personas spec", url: "https://github.com/robertknelson/census/blob/main/.docs/features/personas.md" }
  - { label: "Go-live runbook", url: "https://github.com/robertknelson/census/blob/main/.docs/go-live-personas.md" }
  - { label: "Gatehouse spec", url: "https://github.com/robertknelson/census/blob/main/.docs/features/gatehouse.md" }
  - { label: "Census on AppTrak spec", url: "https://github.com/robertknelson/census/blob/main/.docs/features/census-on-apptrak.md" }
phase_suggestion: execution
ignite: start-census.bat
windows:                                   # OPT-IN: shown through plinth (private door)
  - host: census
    at: http://localhost:5292
    audience: [robert]
    ask: "does View as, the impersonation banner and the Reset page read well? (sign-in now gates the window; see Anything alarming)"
    look:
      - { label: "the persona shell, View as", path: "/personas" }
      - { label: "the Reset page and Census documents", path: "/personas?at=admin.reset" }
      - { label: "the estate", path: "/" }
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

**Census moved onto AppTrak, with sign-in, impersonation and ownership** (5 November, committed, not pushed). The
plan and every decision are in `.docs/features/census-on-apptrak.md` and `.docs/decisions.md` (D-001 to D-005):

- **A reset:** one call wipes everything people added and keeps what was observed. Every wiped row is kept, and one
  button undoes it. You can now start from a clean slate and watch real use.
- **Windows sign-in and impersonation:** a system administrator can act as any member ("View as"). A banner with Stop
  shows on every page. Changes made while impersonating are recorded as the member's, with you beside them.
- **Command/query:** every SQL path in Census now runs through the handlers, the same shape as your live app. Every
  answer was checked to be the same before and after.
- **Product owners see only their own:** Move It, Usage, Log Explorer and Trace answer each member only for their
  applications and features. Owners can add their own releases and features.
- **Census's own settings in AppTrak:** tags, systems, baselines and five more documents live in AppTrak when Census
  runs with it. Every change is audited, the reset covers them, and Import and Export are on the Reset page.
- **A role-drift report** on Membership: any role in use that the official role list does not offer.

## What's next

- **Your word on four things** (listed under *Anything alarming*).
- **Before a second person edits Census's settings:** have each editor save only what it changed, instead of the
  whole document.
- **On the real AppTrak, after you port:** run, in order, `reset/001`, `identity/001-impersonated-by`,
  `fm/003-owners-curate` and `census/001-assertions`. Then import the eight documents from the Reset page.
  `reset/002-arm-reset` only on a database that is not production.

## Anything alarming

- **Sign-in now gates every page, the demo profile included.** This window answers 401 from the road unless what opens
  it carries Windows credentials. Say whether the demo profile should stay open.
- **Census's settings editors** (tags, systems, baselines, blacklist, views) still accept any signed-in user. Say which
  roles may edit them.
- **The feature picture** shows a linked item's title even from an application the reader cannot see. Keep it, or hide it?
- **Nothing is pushed.** It is all committed locally, waiting on your word.
