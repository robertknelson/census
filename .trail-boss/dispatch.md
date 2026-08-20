---
# ── the app reads exactly these; everything else is yours ──
summary: "The Atlas is open: pick a system at /atlas, see its dependency graph — stages now belong to each system claim"
resume: "RESTART the app first (running instance predates today's backend), then http://localhost:5199/atlas"
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

**The Atlas** — a new page at `/atlas`, deliberately separate from the Estate:
pick a system, get its dependency graph. Views are tabs you build (system +
stage filter + layout) and they come back exactly as you left them — the graph
settles once and freezes, dragging pins a node, and positions survive reopening.
Filtering to a stage *fades* everything else rather than hiding it, so an edge
crossing stages stays visible — that's environment-bleed detection for free.
Click anything and a small corner card shows what it is, who said what it
serves, and each edge's evidence. Everything human-asserted draws dashed, as
everywhere.

Two foundations went in underneath, both from the day's design conversation:

- **Stages now belong to each system claim.** A database can serve MyFancy at
  dev *and* val while serving Other at val only — the old model literally could
  not say that and quietly implied combinations nobody asserted. Existing files
  keep working unchanged forever; anything edited from now on is written the
  precise way. Blast-radius answers got strictly more truthful (the demo's
  mixed-stage task now answers two deployment lines where the old model would
  have invented four).
- **Systems have name cards** (`config/systems.json`): description, note, and
  optionally the stages a system is *supposed* to have — so the Atlas's registry
  panel can say "you expected a UAT stage and nothing serves it" and flag names
  in use that nobody registered.

Also fixed from the field report: attributing an unresolved endpoint is now one
row at a time with the input appearing where you clicked, Enter saves, and any
refusal shows up right at the row instead of off-screen at the top.

## What's next

**Restart the app** — the instance running during the session predates all of
this. Then: build a real system's view in the Atlas, and do the ratification
pass — several detail decisions were applied under the "go" and are flagged in
the three specs (entity-associations, systems-registry, system-view) for a
yes/redirect each. The field trial continues with associations, the registry,
and the Atlas in hand.

## Anything alarming

- **The remote login has still never actually been tested.** First real remote
  collection should be watched by hand.
- **Today's work is demo-verified only.** The association conversion reads old
  files as-is by design, but real data has drawn blood on first contact every
  time — treat the first real run as live fire, especially the first Triage
  edit of a real leaf (it rewrites that leaf in the new shape).

Nothing is broken. Build clean, everything pushed, every fixture branch answers
as designed.
