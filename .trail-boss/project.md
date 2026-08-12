---
# ── minted by the app; do not hand-edit ──
schema: 1
id: census-3754                 # immutable join key — never change this
created: 2026-07-31

# ── required ──
name: census

# ── essence: fill in as the idea forms (all optional) ──
description:
intent: execute a census of the machines
value_prop:
scope:

# ── state ──
phase: discovery
next_step: "Live-fire the credential hop — collector over WinRM against a clixml bucket, interactive with -Verbose, before any schedule trusts it"
standing: underway          # underway|parked|blocked|review — where it sits across the range (docs/STANDING.md)

# ── synthesis ──
themes: []
relates: []
---

## notes

### 2026-08-12
- Approved baselines specced, built, verified in the browser, shipped: bless a
  machine's software set as approved for a facet-selected scope, judge every
  machine against the union of matching baselines. Both directions —
  `unapproved-software` (medium) and `missing-required-software` (high).
- Spec: `.docs/features/approved-baseline.md`. Config: `config/baselines.json`
  (empty; real fleet) and `config/baselines.demo.json` (five baselines, the
  fixture set).
- Fixed: every error message in Census.Web had been rendering gray, not red —
  `.est-error` was declared above `.est-status` at equal specificity.
- First dispatch ever filed for this project. The `.trail-boss` files had sat
  as-minted since 2026-07-31 while the collector and the whole web app were
  built, so the board showed nothing.

### 2026-07-31
-
