# Canonical names — the identity stage variants share

> Spec, 2026-08-21. Robert's case: MyAppDB-DEV, MyAppDB-VAL and MyAppDB (prod)
> are all "the same" database; MyWeb-VAL and MyWeb-UAT on WebVal are separate
> observed websites but one logical thing. He translates seamlessly to
> "MyWeb / WebDev, WebVal, WebUat, WebProd" — the clean view management wants.
> Rulings from conversation: the term is **canonical** (2026-08-21); scope is
> **per-system**. Parent docs: `entity-associations.md` (the shape this rides),
> `system-view.md` (where grouping renders). Status: **ratified as proposed
> 2026-08-21 (all §7 items), built same day.**

## 1. What this is — and is not

A canonical name is a **third asserted fact**, sibling to system and stage:
"this observed entity is, within that system, the thing called MyAppDB."
Observation can never establish it — a system may legitimately own several
genuinely distinct databases, so "serves the same system" does not imply "same
DB." And it is **never sniffed from name similarity**: `MyDB_DEV` beside
`MyDatabase_DEV` is exactly the ambiguity that killed the fall-2025 graph
(G-2), and the fixture's one-component-three-conventions trap is this
feature's proving ground — a human resolves in one click what no rule can.

It is not an override. The observed name is never replaced anywhere; the
canonical name *groups*. Nor is it an alias in the `graph-interop.md` §4.1
sense — that word stays taken by machine aliases.

## 2. The shape — it lives on the association

```json
"MyAppDB-DEV": {
  "serves": [
    { "system": "MyFancy", "stages": ["dev"], "canonicalName": "MyAppDB",
      "assertedBy": "robert", "assertedAt": "2026-08-21" }
  ]
}
```

- **Per-system scoping falls out of the placement** (ruled 2026-08-21): the
  claim is "within MyFancy, this is MyAppDB." Two systems may each have a
  "ReportsDB" without collision, and one physical entity serving two systems
  may carry a different canonical name in each.
- Optional, per association. Absent means ungrouped — the entity renders as
  itself, today's behavior.
- A canonical name without a system claim is impossible by construction —
  the field has nowhere to sit. The dangling-canonical question never arises.
- Same identifier twice within one system at the **same** stage is not a
  collision — it is a farm: MyWeb prod on WEB01 and WEB02 is one canonical
  node with two host edges, which is precisely the clean view.
- Unknown-key round-trip already covers readers that predate the field.

## 3. Triage — asserting it

The bar's association gesture (`entity-associations.md` §5) gains an optional
canonical-name field: select the three MyAppDB variants across three machines,
assert system + canonical name in one apply — stage chips per row as today.
Edit opens it alongside stages; emptied = ungrouped. Chips render it:
`MyFancy · dev, val · as MyAppDB`.

## 4. Atlas — where the clean view lives

Within a system view, entities sharing (system, canonicalName) collapse into
one **canonical node**: labeled with the canonical name, stage chips = union
across variants (ghost-never-hide per stage), one edge per distinct host.
Ungrouped entities render as themselves beside it. The inspector expands a
canonical node into its concrete observed variants — observed name, host,
stages, per-association provenance — so the clean label is one click from the
evidence.

## 5. Observation surfaces — untouched

Hosting, dossier, Triage rows, blast radius all keep observed names: "which
physical site dies" is a question the collapsed view cannot answer. Clean view
for management, observed view for operators, same truth underneath.

## 6. What does not change

Resolution semantics, attribution/endpoints, rollups, the unclassified pile's
arithmetic. G-2 is preserved by construction — the canonical name is input,
never inference.

## 7. Open items — ratified as proposed, 2026-08-21

1. ~~Field name~~ — `canonicalName` on the association.
2. ~~Atlas-only this slice~~ — the classic hosting view's logical toggle
   (`MyWeb / WebDev, WebVal, WebUat, WebProd` as a listing) stays deferred
   until Atlas proves the gesture.
3. ~~Blast radius labeling~~ — unchanged this slice; a parenthetical canonical
   name on deployment lines could come later without touching traversal.
4. ~~Bulk apply merge rule~~ — the bar sets a canonical name only where
   absent; overwriting a differing one is the edit gesture alone, never bulk —
   never silently renaming things somebody else named.
5. ~~Registry involvement~~ — none (a registry of canonical names would be
   membership through the back door, R1). The bar suggests names already in
   use within the selected system — vocabulary, not registry.

## 8. Verification (fixtures per branch)

The three-conventions trap grouped under one canonical name across three
stages — the fixture that no naming rule can pass becomes the demonstration;
a farm case (same system, same canonical name, same stage, two hosts → one
node, two host edges); two systems each owning a "ReportsDB" (no collision);
one entity serving two systems under two canonical names; ungrouped entities
rendering beside canonical nodes; emptied field returning the variant to
itself; unknown-key round-trip; blast radius and hosting byte-identical
before and after assertions.
