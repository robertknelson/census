---
# ── the app reads exactly these; everything else is yours ──
summary: "Clean view shipped: canonical names collapse stage variants in Atlas; machine stage now derives from what it hosts"
resume: "RESTART the app (running instance predates today's slices), then /atlas MyWeb for the clean view; group your real stage variants in Triage's new 'as' field"
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

Two ratified-then-built slices, both from today's design conversation:

- **Canonical names — the clean view.** MyAppDB-DEV, MyAppDB-VAL and MyAppDB
  are one logical database wearing three names; you can now say so. The claim
  rides the system assertion (per-system, so two systems can each have a
  "ReportsDB" without colliding), is typed into Triage's new "as" field, and
  the Atlas collapses the variants into a single node — "MyWeb" over
  DEVWEBBOX, PRODWEBBOX, VALWEBBOX — with the observed names one click away in
  the inspector. Hosting, dossiers and blast radius keep the observed names:
  clean view for management, operator truth untouched. Never guessed from
  name similarity — that rule stands.

- **Machine stage derives itself.** A machine's stage now rolls up from what
  it hosts; a hand-asserted stage in assets.json still wins, completely — no
  merging — and when the assertion disagrees with what's inside, a low
  finding says so instead of anyone silently losing. Removing the asserted
  entry is how you release a machine to the derived value. Baseline scoping,
  the canvas, and the compliance CSV all read the effective stage.

## What's next

**Restart the app** — the running instance predates both slices. Then the
field trial continues: group your real stage variants under canonical names
in Triage and look at the clean view in the Atlas. Parked with a trigger: the
same collapsed listing in the classic Hosting view, once the Atlas gesture
proves itself on real data.

## Anything alarming

- **The remote login has still never actually been tested.** First real
  remote collection should be watched by hand.
- **Demo-verified only, as always.** Real data has drawn blood on first
  contact every time; the first canonical grouping of real entities is the
  live-fire moment.

Nothing is broken. Build clean, all pushed, every fixture branch answers as
designed — including the round-trip that proves untouched leaves stay
byte-identical.
