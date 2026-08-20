---
# ── the app reads exactly these; everything else is yours ──
summary: "Declared entities shipped: scheduled tasks and partner APIs join the map, and 'the partner API dies?' gets an answer"
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

**Declared entities — the map now covers things census cannot observe.** Two
real needs from Robert's field trial drove it: Windows scheduled tasks (which
will never be collected — ruled) and partner APIs outside the estate (common in
any large organization). Both are now first-class, with one hard line held
everywhere: something a *person* declared never dresses up as something census
*measured* — declared things draw dashed, carry who-said-so-and-when, and are
never "verified", because there is nothing to verify them against.

- **Declare it.** Triage gained a "Declare entity…" form: name a scheduled task
  on a machine, or an external API with the web/database addresses that belong
  to it. Same tagging, same bulk gestures, same pile-counting as everything
  observed.
- **The pile got honest about the outside world.** Census already *sees* the
  connection strings and URLs apps carry. Any address that is neither an estate
  machine nor a declared entity now shows up as an "unresolved endpoint" —
  one click attributes it to an entity (or declares a new one on the spot).
  Matching is exact against what a human typed, never guessed: a declared
  address that names an estate machine loses to the machine and says so in
  red; one that matches nothing reads "matched by 0 edges" next to the typo.
- **The new blast-radius question.** Every external entity has a button
  answering *the outage you don't control*: "the partner payments API dies →
  OrderPortal production, via this app on this box, from this config file."
  The demo answers exactly that on screen.

A bonus find: machines that exist only as assertions (a decommissioned box a
tag still points at) were silently missing from the map and their warnings
never showed. They now draw as ghost tiles carrying their warning.

## What's next

**Still the field trial — now with more to test.** The written protocol
(`.docs/field-trial-real-estate.md`) stands; this session added things worth
exercising on real infrastructure: declare a real scheduled task, declare a
real partner API, and see what the unresolved-endpoints pile digs out of real
connection strings — that list is expected to be the fastest source of "oh
right, THAT system" moments. Robert runs it; the next session turns the
report-back into fixes and rulings.

The Baselines tab also got its field-trial fixes: the list is now grouped by
what each baseline covers (whole fleet, a machine type, a stage, one machine),
and a "Bless a new baseline…" button creates one right there — pick the source
machine and the scope pre-fills from what that machine is. Blessing a machine
whose software collection failed is refused with the reason shown.

## Anything alarming

- **The remote login has still never actually been tested.** All runs so far
  are against the one local box; the first real remote collection should be
  watched by hand.
- **Real data has broken something on first contact every time so far.** The
  new declared-entities work has only met the demo fleet; treat its first real
  run as live fire.

Nothing is broken. Build clean, everything pushed, demo fleet answers all its
designed questions.
