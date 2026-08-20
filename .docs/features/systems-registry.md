# Systems registry — identity for the names tags share

> Spec, 2026-08-20. Ratified in conversation (R1): normalization stays a derived
> join over entity associations (`entity-associations.md`); this file adds only
> **identity**. Parent docs: `system-graph-principles.md`, `system-view.md` (the
> module that hosts the editor). Status: **ratified in substance; §5 details
> proposed-and-applied under the 2026-08-20 "go", for ratification on return.**

## 1. Purpose

"MyFancy" exists today only as a value assertions agree on. The registry gives
each system a name card — description, note, expected stages — so census can
say "you expected a val stage and nothing serves it", and so pickers have a
spine. **It never lists members.** Membership lives solely in entity
associations; a registry that owned membership would be dual truth and the road
to a hand-maintained CMDB (rejected).

## 2. The artifact — `config/systems.json`

Operator-owned sibling config, hand-editable, relaxed escaping, the established
pattern:

```json
{
  "version": 1,
  "systems": {
    "MyFancy": {
      "description": "Customer-facing ordering, the flagship",
      "expectedStages": ["dev", "val", "uat", "prod"],
      "note": "UAT retires when val absorbs it",
      "assertedBy": "robert",
      "assertedAt": "2026-08-20"
    }
  }
}
```

- Name is the key, `OrdinalIgnoreCase`, matching association values by exact
  case-insensitive equality — the same human-asserted-name matching as
  everywhere; never fuzzy.
- `expectedStages` optional; absent means no completeness claim.
- Unknown keys round-trip (extension data).

## 3. Rules

- **A tag value with no registry entry is legal** — free-form survives (the
  §8.3 lineage). It lists as *unregistered* in pickers, one gesture to
  register. Never an error, never a finding.
- **A registry entry with zero tagged members is a panel smell** ("no entity
  serves this"), the matched-by-0-edges pattern — a config observation, not an
  estate fact.
- **Expected-stage drift is findings-grade**: `expected-stage-missing` (an
  expected stage no association carries; medium — someone asserted it should
  exist) and `unexpected-stage` (a stage in use nobody expected; low —
  detection, not restriction). Severities provisional as ever.

## 4. Surfaces and write flow

`GET /api/systems` → the file; `PUT /api/systems` → whole-file replace, the
config-editor pattern with its known caveats. The **editor lives in the Atlas
module** (`system-view.md`) — system identity is system-space; Estate/Triage
only *reads* the registry (picker suggestions). Hand-editing remains first-class.

## 5. Proposed-and-applied details (ratify on return)

1. Registry-backed picker ordering: registered systems (with descriptions)
   first, unregistered in-use values beneath, free text always allowed.
2. Finding kinds/severities as §3.
3. Zero-member smell lives in the Atlas registry panel, not Estate.

## 6. Verification (fixtures per branch)

`config/systems.demo.json`: a fully-expected system (no drift), one with a
missing expected stage (finding), one with an unexpected stage in use
(finding), a zero-member entry (smell), an in-use unregistered value (listed,
no finding), unknown-key round-trip, GET/PUT byte-stability.
