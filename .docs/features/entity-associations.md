# Entity associations — stages belong to the system claim (G-7)

> Spec, 2026-08-20. Amends the tag model ratified in `entity-tags.md` (G-4's two
> independent axes) and inherited by `declared-entities.md`. Parent docs:
> `system-graph.md` (decision log gains G-7), `systems-registry.md` (identity),
> `system-view.md` (the read side). Status: **ratified.** R2 (the shape itself)
> ratified 2026-08-20 in conversation; the §7 items ratified as proposed
> 2026-08-25.

## 1. The wound

An entity carries two independent multi-value axes: `system: [MyFancy, Other]`,
`stage: [dev, val]`. Every consumer reads them as the **cross-product** — which
cannot express Robert's real case (2026-08-20): a database serving MyFancy's
dev *and* val but Other's val *only*. The flat model silently asserts the
Other×dev deployment nobody claimed. The stage list must belong to the system
claim, not to the entity.

## 2. The shape — ratified

```json
"MyFancyDB": {
  "serves": [
    { "system": "MyFancy", "stages": ["dev", "val"], "assertedBy": "robert", "assertedAt": "2026-08-20" },
    { "system": "Other",   "stages": ["val"],        "assertedBy": "robert", "assertedAt": "2026-08-20" }
  ]
}
```

- One association per system claim, each with its own stage list. Subsumes every
  candidate shape: `system.stage→entity` is a singleton list, `system→entity` an
  empty one, n-systems-n-stages the general case.
- **Empty `stages` means "stage not asserted" — never "all stages".** An
  assertion says only what a human said; "all" would be inference by default
  value. An unstaged association renders explicitly and counts as partially
  classified.
- **Provenance moves to the association** (proposed, §7.1): different people
  assert different system claims onto one entity; leaf-level last-writer would
  lose who said which. Merging an association touches only its own provenance.
- Applies identically to entity-tag leaves (databases, applications) and
  declared-entity records (machine-anchored and external). `kind`, `note`,
  `endpoints` on declared records are unchanged — associations replace only the
  `system`/`stage` axes.
- Unknown extra keys keep round-tripping at both the leaf and association level.

## 3. Compatibility — read both forever, write the new shape

Open/closed at the schema level, the declared-entities precedent:

- **Readers accept both shapes.** A legacy flat leaf (`system[]` + `stage[]`) is
  interpreted as the cross-product it always meant — permanently; no migration
  event, no file breaks, `entity-tags.json` and `declared-entities.json` stay
  valid as they sit on disk.
- **Writers emit associations.** Any leaf Triage edits is upgraded in place
  (flat axes converted to their cross-product associations, then the edit
  applied). Hand-editing may use either shape.
- A leaf carrying *both* shapes is read as legacy-converted-then-merged, and the
  first UI write normalizes it.

## 4. Consumer semantics

- **Rollups** (machine/instance/site): union over associations; `derivedFrom`
  carries the contributing associations, so a derived badge traces to "who said
  this entity serves that system at that stage".
- **Blast radius** (machine and external subjects): deployment lines come from
  associations, not the cross-product — strictly fewer, never more, lines than
  today, and each one was actually asserted.
- **Unclassified** now means **zero associations**. An association with empty
  stages is partially classified: out of the unclassified pile, but marked
  unstaged wherever stages render.
- **Suggestion vocabulary**: systems in use = distinct association systems (plus
  the registry, `systems-registry.md`); stages in use = distinct stages across
  associations.

## 5. Triage — the association-assignment surface (R3)

One-writing-surface stands (triage-workbench.md §7). The bar's gesture becomes:

- **Select rows → assert one association**: system (picker fed by the registry;
  free text still legal) + stage chips. Apply merges `{system, stages}` into
  every selected entity — same system present means stage-list union, other
  associations untouched.
- **Rows render their associations as removable chips** (`MyFancy · dev, val`),
  each deletable alone; retiring one system's claim never disturbs another's.
- **Edit** opens one association for overwrite (its stages; emptied = unstaged).
  Removing the last association returns the entity to the pile (observed) or to
  untagged-declared (declared records survive, per declared-entities.md §10.6).
- **Stage-only bulk apply** (no system named) is ambiguous under associations —
  ruled in §7.2.

## 6. What does not change

Resolution semantics (observed/dangling/unknown/declared) stay per-leaf.
Attribution and `endpoints` are untouched — they answer "which edges are yours",
not "what do you serve". The no-naming law, multi-system membership, and the
never-hidden rules are all preserved by construction.

## 7. Open items — all ratified as proposed, 2026-08-25

1. **Association-level provenance** (proposed above) vs keeping leaf-level
   last-writer. Association-level is more code and more truth. *(Ratified.)*
2. **Stage-only bulk apply.** Proposed: allowed only when every selected entity
   has exactly one association (the stages merge into it); otherwise the bar
   requires a system. Alternative: apply to all associations of each entity —
   rejected as asserting things nobody said. *(Ratified.)*
3. **Upgrade-on-write scope.** Proposed: any leaf a UI write touches upgrades
   whole (all its axes convert), not just the edited association — one shape per
   leaf after first touch. *(Ratified.)*

## 8. Verification plan (sketch — fixtures per branch, as always)

Legacy flat leaf read as cross-product (existing demo files unchanged must
produce today's rollups/blast lines); mixed-stage association (the MyFancy
dev+val / Other val case) producing exactly three deployment lines, never four;
empty-stages association rendering unstaged and filtering never-hidden; Triage
merge (same system → union), per-association remove, upgrade-on-write leaving
the file valid and the untouched leaves byte-identical; declared records with
associations; round-trip of unknown keys at association level.
