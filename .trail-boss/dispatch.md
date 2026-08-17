---
# ── the app reads exactly these; everything else is yours ──
summary: "The system graph shipped: tag what census finds, work the pile in Triage, ask any machine what breaks if it dies"
resume: "cd Census.Web; $env:ASPNETCORE_ENVIRONMENT='Demo'; dotnet run   # then http://localhost:5199"
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

**The whole system-graph idea went from concept to working software in one
session** — three pieces, each one specced, decided, built, and verified in the
browser before moving on:

- **Tagging.** You can now say what a database or website *means* — "this is
  the dev copy of MyWeb" — and census remembers who said it and when. Machines
  show what they carry as a rollup of those tags, drawn dashed so a computed
  label never masquerades as something a person typed.
- **Triage.** A new button in the top bar shows one number: how many things
  census has found that nobody has explained yet. Open it and you get the
  to-do list, grouped sensibly, with checkboxes — select a whole instance,
  type the meaning once, apply to everything selected. The pile shrinks as
  you work. Tags whose target vanished show up here too, with a Remove button.
- **Blast radius.** Select any machine, press one button, and get the answer
  the whole project was built for: *if this box dies, what stops working* —
  named in business terms, not server names. The demo's shared dev/val
  database box answers exactly as hoped: "MyWeb dev and val, YourWeb dev and
  val" — two environments down from one box, visible at last. Every line
  expands to show the evidence, and things census *couldn't* see are listed
  as unknown rather than quietly left out.

Also: the earlier "should census model things it can never see?" question was
withdrawn by Robert as based on a hypothetical — census describes what it
observes, full stop.

## What's next

**The field trial.** Everything above was verified against the built-in demo
fleet. Robert asked for — and has — a written protocol
(`.docs/field-trial-real-estate.md`) covering what to test on real
infrastructure and exactly what to report back: the first watched remote
collection run, whether real connection strings resolve, whether the tagging
model fits a real estate, and whether a blast-radius answer matches what he
already knows. He runs it; the next session turns the answers into fixes and
decisions. Real data has found a gap on first contact twice before; this is
that moment for the new work.

Parked deliberately, with notes on when to pick each up: shorthand for "this
system contains that one" (tag nesting), retiring the old machine-level stage
label, following web-address links between apps, and a systems-by-stages
overview grid.

## Anything alarming

- **The remote login has still never actually been tested.** Census is built to
  reach out to other machines and collect from them, but every run so far has
  been against the one local box. The first real attempt should be run by hand,
  watching it, before anything scheduled depends on it.
- **No real data has touched the new tagging features yet.** The pattern from
  past features: real data arrives, something the test data never covered
  breaks, it gets fixed same-day. Expect that here too; treat the first real
  run as a live-fire event, not a formality.

Nothing is broken. The build is clean, everything is pushed, and the demo
answers its questions correctly.
