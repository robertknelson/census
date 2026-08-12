---
# ── the app reads exactly these; everything else is yours ──
summary: "Approved baselines shipped — the fleet is judged both ways: software nobody approved, and required software missing"
resume: "cd Census.Web; $env:ASPNETCORE_ENVIRONMENT='Demo'; dotnet run   # then http://localhost:5199"
health: green
links:
  - { label: "GitHub", url: "https://github.com/robertknelson/census" }
phase_suggestion: execution
# ignite:             # deliberately unset — ignition is consent-by-declaration and
#                     # has not been asked for. `resume` above is the human-readable hint.
#
# what the owner wants kept visible: NOT YET ASKED (contract rule 7).
# Standing guess until he says otherwise: build health, the one live-verification
# gap, and the next unblocked move.
---

## Where it stands

Two halves, both built. **The collector** (`Invoke-Census.ps1` + `collectors/`)
runs from one control box over WinRM, writes one JSON snapshot per machine per
day, and appends an audit line per machine to `_runs/run-log.jsonl`.
**Census.Web** reads that tree and renders the estate: owner → stage → glyph
canvas → dossier, with a findings stream recomputed on every read.

## This session (2026-08-12)

- **Approved baselines** — the inverse of the blacklist, and the original
  unapproved-software purpose. Bless a machine's software set as approved for a
  scope; a machine's approved set is the union of every matching baseline;
  anything installed and outside that union is a deviation.
- **Both directions.** `required: true` on an entry flips it from "allowed
  here" to "must be here" — `missing-required-software` (high) alongside
  `unapproved-software` (medium). Blessing never sets required; it is asserted
  only, by hand.
- Errors across the whole app had been rendering gray instead of red
  (`.est-error` declared above `.est-status`). Fixed.

## Blockers

- **The credential hop has never been exercised.** No remote WinRM call
  carrying `-Credential` has run — one machine, one account in this
  environment. It ships structurally correct and untested; the first real run
  against a `clixml` bucket *is* the test and should be interactive with
  `-Verbose`. This is `next_step`.
- **No real payload is reachable here**, so the reader is verified against
  `output-demo/` fabrications only. Every render branch therefore needs a
  deliberate fixture; four coverage gaps have been caught that way so far.

## Parked, with reasons in the docs

- Stage-aware severity (a prod hit ≠ a dev one) — `census-web-v2-ux.md` §7.
- Severity tiers unratified; every severity in the app is provisional.
- Host-app import — `.docs/host-import-manifest.md`, waiting on the host.
- Collector long tail: retention, PowerShell floor, machine-list provenance.

## Where the reasoning lives

`.docs/features/` — one file per feature, each with business rules, schema
decisions *with the why*, and an open-items section. `approved-baseline.md` is
the newest. `.docs/requirements.md` is the collector spec.
