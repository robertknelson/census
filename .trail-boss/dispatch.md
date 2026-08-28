---
# ── the app reads exactly these; everything else is yours ──
summary: "Naming a system no longer hides the old picture; the team filter now reaches every fleet panel; classic tables sort"
resume: "start-census.bat — in /atlas flip a tab between canonical and observed; in /estate pick a team then open Software"
health: green
links:
  - { label: "GitHub", url: "https://github.com/robertknelson/census" }
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

Five slices, each asked for in a sentence, ratified in a word, and verified in
the browser before its commit:

- **Atlas: naming a system no longer hides the picture you had before.** Giving
  members a canonical name used to collapse them into one node, permanently.
  Now each view chooses — *canonical* (collapsed) or *observed* (every entity
  its own node) — so the before and after can sit in two tabs side by side.
- **Estate: the team filter reaches Changes, Software, Hosting, and
  Certificates.** Pick a team and those panels list only its machines,
  re-scoping live as you click the rail, with a "scoped to … · show fleet" line
  so a short list never reads as a small fleet.
- **Classic dashboard tidied**: stray links gone, the trend bars show their
  numbers quietly.
- **Classic tables sort by column**: Machines, Coverage, Prohibited (Certificates
  already did). Coverage keeps its "needs attention first" order by default;
  Prohibited keeps the file's own order by default.

## What's next

Nothing owed. Field trial continues at his pace — the two new things worth
trying on real data are the grouping chips in Atlas and a team-scoped Software
panel. The leftover "sysetem-a" view tab is still his to close.

## Anything alarming

- **The remote login has still never actually been tested.** First real
  remote collection should be watched by hand.
- **Demo-verified only, as always** — real data has drawn blood on first
  contact every time.

Nothing is broken. Build clean, all pushed, working tree clean.
