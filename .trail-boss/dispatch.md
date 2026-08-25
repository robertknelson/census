---
# ── the app reads exactly these; everything else is yours ──
summary: "Field-trial verdicts applied: Atlas readable (bigger nodes, key, working inspector); saved views now shared estate config"
resume: "RESTART the app (running instance predates today's backend), then /atlas — the Key button, click-a-node inspector, and shared views are the new things to try"
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

The field trial's verdicts, applied the same day:

- **The Atlas graph is readable now.** Everything drew bigger — nodes, their
  labels, the space between them. There's a **Key** (bottom-left card, Key
  button to toggle) explaining every shape, color and dash. And the
  **inspector works**: click any node or edge and its card opens bottom-right
  with everything asserted about it — two genuine bugs had made it nearly
  undiscoverable (it never truly hid, and everything about the graph said
  "drag me", nothing said "click me").

- **Saved graph views are shared now.** The tabs you build in the Atlas —
  which system, which stage filter, where you dragged every node — used to
  live only in one browser. They now live in `config/views.json` next to the
  other config files, so a view arranged once is arranged for everyone, and
  hand-editable like everything else. Any tabs an old browser was holding
  move up automatically the first time it opens the Atlas.

- **The DevServer machine class is gone**, per ruling: it was hardcoded, not
  data-driven. A server that happens to carry developer SDKs no longer earns
  a label for it. Old snapshots that recorded the retired class still load
  fine — it just no longer means anything.

- **"Blacklist" now reads "Prohibited"** everywhere on screen — the word
  blacklist stays reserved for servers, where it means something else. Only
  the words changed; the config file keeps its name and nothing needs
  migrating.

## What's next

**Restart the app** — the running instance predates today's server-side
changes. Then two small things are owed from the ratification walkthrough:
the sign-offs on the two remaining 08-20 spec sections (entity associations
§7, systems registry §5 and its drift-placement deviation), and one sentence
on what feels rough about the unclassified-neighbor experience in the Atlas
so it can be smoothed.

## Anything alarming

- **The remote login has still never actually been tested.** First real
  remote collection should be watched by hand.
- **Demo-verified only, as always** — today's changes included. Real data has
  drawn blood on first contact every time.
- One demo-coverage note, minor: with DevServer gone, the "asserted class
  beats observed roles" rule is still exercised but less sharply than before
  (documented in the baseline spec). If it ever matters, one extra demo
  baseline would restore the sharp version.

Nothing is broken. Build clean, all pushed, every change verified live in the
browser against the demo fleet before its commit.
