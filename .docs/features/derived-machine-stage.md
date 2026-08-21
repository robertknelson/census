# Derived machine stage — the rollup becomes the default, assertion overrides

> Spec, 2026-08-21. Resolves `system-graph.md` §10.4, deferred 2026-08-17 as
> downstream of the concept work — the trigger fired when associations
> (`entity-associations.md`) gave hosted entities their own stage claims.
> Robert's ruling in conversation: derived is usually correct and useful; an
> override MUST exist; an override is **complete**, never partial. Status:
> **ratified as proposed 2026-08-21 (all §6 items), built same day.**

## 1. The wound

`"DEVSQLBOX": { "stage": ["dev","val"] }` in `config/assets.json` is the only
entry in that file stating no actionable fact — a shrug meaning "there are dev
things and val things in here somewhere." It exists because the machine was
once the finest thing taggable. Its databases now carry `serves` associations
with their own stage lists, so the machine's stage can be a *rollup* — true
and traceable — instead of a hand-maintained echo of what's inside.

## 2. The rule — effective stage

- **Asserted wins, completely.** If `assets.json` carries a `stage` facet for
  the machine, that IS the machine's stage. No merging with the derived set —
  a merged list is a stage set nobody asserted, the exact sin R2
  (`entity-associations.md` §1) exists to prevent.
- **Otherwise derived.** Union of `stages` across the associations of every
  entity hosted on the machine (tagged and declared alike), with `derivedFrom`
  carrying the contributing associations — the established rollup pattern.
  Renders with the dashed derived badge wherever machine stage renders.
- **Neither means no stage.** A machine with no asserted facet and no staged
  associations has no stage. Absence is signal; nothing defaults.

## 3. Drift — the override is a statement, not a blindfold

When an asserted stage exists, the derived set is still computed underneath.
Asserted ≠ derived is visible tension — possibly deliberate (a machine being
drained to dev-only), possibly an error — and must surface, never silently
lose to the override. Unlike expected-stage drift (`systems-registry.md` §3),
this claim has an honest machine to hang on, so the machine-keyed findings
stream can carry it without minting ghost tiles — proposed in §6.1.

## 4. Consumers

Everything that reads machine stage today — baseline `appliesTo` matching,
facet filters, canvas grouping, dossier — reads the **effective** stage and
does not know which branch produced it. Asserted behaves byte-identically to
today; derived is new coverage, not changed behavior.

## 5. Migration — none, deliberately

Existing `assets.json` stage entries stand as overrides until a human removes
them, per entry, when satisfied the rollup says it better. No migration event,
no file rewrite — the read-both-forever ethos applied to a facet. Removing the
entry by hand (or via the assets editor) *is* the release-to-derived gesture.

## 6. Open items — ratified as proposed, 2026-08-21

1. ~~Drift surface~~ — a machine-keyed finding (`stage-override-drift`, low):
   the machine is an honest subject, so the reasoning that exiled system drift
   to the Atlas panel argues the opposite way here.
2. ~~Machine `system` facet~~ — nothing to do; the system rollup already
   exists and machines carry no asserted `system` in `assets.json`.
3. ~~Severity/name~~ — `stage-override-drift`, low; provisional like every
   severity until the tiers ratify (census-web.md §8).

## 7. Verification (fixtures per branch)

Asserted-only machine (today's behavior, byte-identical); derived-only
(assertion removed, rollup union with `derivedFrom`, dashed badge); both
agreeing (no drift); both differing (drift surfaces, effective = asserted);
neither (no stage renders, nothing defaults); baseline `appliesTo` matching a
derived-only stage; unstaged associations contributing nothing to the union.
