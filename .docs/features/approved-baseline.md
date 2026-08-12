# Approved Baseline — the inverse of the blacklist

> Status: ratified 2026-08-12, not yet built. Proposed 2026-08-01, parked undiscussed;
> spec conversation held and open items decided 2026-08-12.
> Companion to `.docs/features/census-web.md` (v1 engine) and
> `.docs/features/census-web-v2-ux.md` (the semantic layer). Everything here is a **reader**
> concern — the collector is untouched, and this feature adds no field to the envelope.

## 1. Purpose

The blacklist catches **known-bad**: someone has to have thought of the software before it can
be found. That inverts badly at the thing this estate was actually chartered to do —
`.docs/requirements.md` §1 names *unapproved-software detection* as a primary use, and a
blacklist can only ever detect the unapproved software somebody already enumerated.

A **baseline** is the other direction: bless a trusted machine's software set as approved for a
scope, and anything extra on a machine in that scope becomes a finding. The census stops
answering only "did we find something we were looking for" and starts answering "is there
anything here nobody approved."

**Vocabulary**, fixed: a **baseline** is the artifact; **bless** is the verb; a machine is
**within scope** of a baseline; an installed item that no matching baseline approves is a
**deviation**.

## 2. The artifact — `config/baselines.json`

A fourth operator-owned config, sibling to `machines.json`, `blacklist.json` and
`assets.json`. Same pattern as the other two editable ones: the file stays the artifact,
hand-editable, pretty-printed, relaxed escaping, edited in the UX rather than only in the UX.

```json
{
  "version": 1,
  "baselines": [
    {
      "id": "fleet-common",
      "label": "Fleet common set",
      "appliesTo": {},
      "active": true,
      "note": "Everything every machine is allowed to carry.",
      "provenance": {
        "sourceMachine": "WEB01",
        "sourceDate": "2026-08-12",
        "blessedUtc": "2026-08-12T14:02:11Z"
      },
      "entries": [
        {
          "displayName": "Microsoft Edge",
          "publisher": "Microsoft Corporation",
          "architecture": "x64",
          "installScope": "machine",
          "observedVersion": "128.0.2739.42"
        }
      ]
    },
    {
      "id": "web-prod",
      "label": "Web servers, production",
      "appliesTo": { "class": ["WebServer"], "stage": ["prod"] },
      "active": true,
      "provenance": { "sourceMachine": "WEB01", "sourceDate": "2026-08-12", "blessedUtc": "…" },
      "entries": [ … ]
    },
    {
      "id": "web03-wireshark",
      "label": "WEB03 — packet capture",
      "appliesTo": { "machine": ["WEB03"] },
      "active": true,
      "note": "Approved for the load-balancer investigation, 2026-08.",
      "provenance": { "sourceMachine": null, "sourceDate": null, "blessedUtc": "…" },
      "entries": [ { "displayName": "Wireshark", "publisher": "The Wireshark developers", "architecture": "x64", "installScope": "machine", "observedVersion": "4.2.5" } ]
    }
  ]
}
```

`active: false` retires a baseline without deleting the record of what was once approved —
same affordance as `BlacklistRule.Active`.

## 3. Materialized by value, never a pointer to a golden machine

**Decided.** `entries` holds the actual approved set, copied out of the source machine's
snapshot at the moment of blessing. The alternative — storing `"baseline": "WEB01"` and
re-reading that machine's latest snapshot on every evaluation — is rejected:

- **The reference would drift silently.** Someone installs a tool on WEB01 and the approved set
  for every web server in production widens, with nothing announcing it. That is the precise
  failure mode the census exists to kill; a mechanism that reintroduces it at the governance
  layer is worse than not having the mechanism.
- **It breaks under as-of and under retention.** A pointer needs a date to be meaningful, and
  the day that snapshot ages out the baseline evaporates.
- **Blessing is a human assertion at a moment.** Storing it by value makes it reviewable and
  diffable — `git diff config/baselines.json` is the audit trail for what was approved and
  when. Widening the approved set is then a deliberate re-bless gesture that shows up as a
  diff, which is exactly the visibility a pointer destroys.

`provenance` records where the set came from (`sourceMachine`, `sourceDate`) and when it was
blessed. **There is no `blessedBy`** — Census Web has no auth by permanent ratification
(v2-UX §7); identity lives in the host app, and inventing a name field here would produce a
field nobody can populate honestly.

## 4. `appliesTo` — a facet selector, not a class×stage tuple

A machine matches when, **for every key present in `appliesTo`, the machine holds at least one
of the listed values.** Values compare case-insensitively, as everywhere else in the facet
model.

- **`{}` matches the entire fleet.** That is the natural reading of "every key present" and it
  is the fleet-common-set case, so it is deliberate rather than an accident to guard against.
- **Two reserved pseudo-keys.** `class` resolves through `MachineClassifier.Resolve` — an
  asserted present-as override wins over observed roles, so a dev box on a Server SKU that has
  been called a `DevServer` is judged as one. `machine` matches the machine name directly.
  Reserved keys win a collision with an operator-invented facet of the same name; that is
  stated here so it is not discovered.
- **Every other key is a free-string facet from `assets.json`** — `stage`, the ownership key,
  `app`, whatever the operator invented. Baselines therefore work per team or per application
  the day someone wants that, with no schema change.

The original proposal said class×stage. It is expressed here as the common *case* of one
general selector rather than as the mechanism, because the semantic layer already settled on
flat multi-valued key=value facets (v2-UX §3.1) and a second grouping vocabulary would have to
be kept in sync with the first forever.

The shape is deliberately the one v2-UX §7 already sketched for stage-aware severity
(`appliesTo: { "stage": ["prod"] }`), so when that lands both features select machines the
same way.

## 5. Union across matching baselines — and no inheritance

A machine's approved set is the **union of `entries` across every active baseline it matches.**

This is forced by covers-not-partitions (v2-UX §3.2): facets are multi-valued, a dev+qa machine
genuinely matches both a dev and a qa baseline, and any rule other than union would have to
pick a winner between two things that are both true.

It also means **no `extends` field and no inheritance is needed** — "fleet-wide common set plus
per-class additions" composes out of overlapping scopes. Overlapping scopes *are* the
composition mechanism, and adding a second one would need precedence rules that the union has
no use for.

**There is no exemption concept.** A one-machine allowance is a baseline scoped
`{ "machine": ["WEB03"] }` with a `note` — see `web03-wireshark` above. An exemption is
already precisely "a small extra approved set for a narrow scope," so modelling it as a second
kind of thing would duplicate the matcher and the union rule to express what they express
already.

## 6. Comparison rules — where the false positives would come from

### 6.1 Entry key: (`displayName`, `architecture`, `installScope`), case-insensitive

Two deliberate divergences from keys used elsewhere, both because a **cross-machine** key is a
different problem from a **same-machine-across-days** key:

- **The owning SID is dropped**, and `hive` collapses to `installScope` of `machine` |
  `per-user`. `DiffEngine.AppKey` keeps the SID and is right to — it compares one machine on
  two days, where the SID is stable and meaningful. Across machines the SID is machine-local,
  so keying on it would make every per-user install a deviation on every machine but the one
  that was blessed. Per-user installs are explicitly in scope for this estate
  (`.docs/requirements.md` §3.7), so this is the difference between the feature working and
  the feature emitting a page of noise.
- **`publisher` is informational, not part of the key.** Publisher strings drift across
  versions of the same product ("Microsoft Corporation" → "Microsoft"), and a key that includes
  it turns one vendor rename into a simultaneous missing-and-extra pair. It is carried in the
  entry because a human reading `baselines.json` needs to know which "Agent" was approved.

This diverges from the diff key in `.docs/plan.md` §6.4, which names
(Publisher, DisplayName, Architecture, Scope, OwnerSid). That key is not being relitigated —
it governs day-over-day diffing, a different job, and `DiffEngine` had already departed from it
for the same reason. Recorded here so the difference reads as a decision rather than an
oversight.

### 6.2 `systemComponent` entries are excluded from comparison

Servicing rows — Office and Visual Studio patch entries — are not installed software, and
including them turns a baseline comparison into a patch-level comparison that differs on every
machine and every month. They stay in the payload and in the software pivot; they are simply
not eligible to be a deviation.

### 6.3 Versions are never compared

A baseline approves **identities**, not versions. `observedVersion` is provenance: what the
source machine had at blessing time, useful to a human reading the file, never matched against.

Pinning versions would make every routine patch a deviation and the stream would be worthless
by day two — the same reasoning that keeps volatile fields out of the collector's per-collector
hash (`census-collector.md` §6.3). Version constraints already have an owner: a blacklist rule
with a `<` operator (`BlacklistVersionConstraint`), which is a targeted assertion about a
specific known-bad version rather than a blanket freeze.

### 6.4 Only the extra direction produces findings

Blessing a golden machine also implicitly describes what *should* be present, and "the
monitoring agent is missing from WEB03" is a real finding. It is **not built here**
(decided 2026-08-12): *approved* and *required* are different assertions, and conflating them
would make every optional tool that happened to be on the source machine mandatory across the
whole scope. The entries carry everything a later missing-direction pass would need, so this
costs nothing to defer. Open item §10.

## 7. The finding

One finding per machine, **not one per deviating app**:

| | |
|---|---|
| `kind` | `unapproved-software` |
| `severity` | `medium` — provisional, inherits the unratified tier question (census-web.md §8) |
| `title` | `N unapproved items` |
| `detail` | The deviating entries, enumerated |

**Why rolled up.** `blacklist-hit` fans out one finding per hit and should — a blacklist rule is
deliberately narrow, so each hit is a distinct thing somebody named. A baseline deviation is
open-ended: the first real machine will produce dozens, and findings have **no lifecycle** by
ratification (v2-UX §4 — no acknowledge, no snooze, recomputed every read). A per-app fan-out
is the single most likely thing to make raw truth drown the signal and force that ruling to be
reopened. Rolling up protects it.

The full deviation list lives in the machine dossier, where a working list belongs; the
findings stream carries the count and the pivot into it.

### 7.1 Coverage, not a per-machine finding

A machine matched by no baseline produces **no finding** (decided 2026-08-12). Baselines are
opt-in per scope, and a fleet where only web-prod has been blessed should not indict every
laptop. This deliberately differs from the loud-unassigned ratification (v2-UX §3.3), where the
missing assertion makes the machine invisible to every grouping; an unbaselined machine is
still fully visible everywhere else.

**But the coverage must be stated, not implied.** "No deviations" reading as "everything is
approved" when nothing has been blessed is lying by omission — the same discipline as
`plan.md` §5.3 (a census that publishes findings before it publishes coverage) and the
collector's unknown-is-never-absent rule. The findings panel and the baseline view therefore
carry **"N of M machines are within a baseline's scope"** wherever deviation counts are shown.

## 8. As-of

Nothing to build. The ratified as-of rule already judges a past day's observations under
**today's** assignments and rules (v2-UX §6, 2026-07-31); baselines are rules. A past view
shows what that day's software set would be judged as now, and the loud past-view banner
already says so.

## 9. Surfaces

- **Bless gesture** — "Bless as baseline…" from the machine dossier, opening the baseline
  editor in the same slide-in panel as the blacklist and assignment editors, pre-filled with
  that machine's current app set (system components already filtered) and an `appliesTo`
  builder that suggests keys and values mined from `assets.json`, as the assignment editor
  does.
- **Baselines list** — the existing baselines, their scope, entry count, provenance, and how
  many machines each currently matches. Activate/retire, edit, delete.
- **Machine dossier** — a deviations section: what this machine carries that no matching
  baseline approves, and which baselines matched it.
- **Findings stream** — the rolled-up finding, with the coverage line from §7.1.
- **Software pivot** — the existing "where is X installed?" view gains an approved/unapproved
  marker, since it is already iterating the same data.

## 10. Open items

- **Missing-direction findings** — "the baseline has it, this machine does not." Parked
  deliberately (§6.4), not forgotten. Needs one real baseline in place before it can be judged
  whether *required* is a separate assertion worth its own artifact or a flag on an existing
  entry.
- **Severity tier** — `medium` is provisional. Entangled with the unratified severity tiers
  (census-web.md §8) and with stage-aware severity (v2-UX §7): an unapproved package in prod
  and the same one on a dev laptop are not the same finding.
- **Blessing from more than one source machine** — merging two machines' sets into one baseline
  at bless time. The union rule already achieves it with two baselines sharing a scope; a merge
  UI is only warranted if that proves clumsy in practice.
- **First-run seeding is an operational step, not a schema question** — see §11.

## 11. Rollout

**Fleet-wide common set first** (decided 2026-08-12), then narrower baselines per class.

Blessing one machine per class as the first move would produce a large, unreadable deviation
list on every other machine, because the bulk of any Windows machine's uninstall entries are
the same everywhere. Starting from a fleet-common baseline absorbs that bulk once; the
per-class baselines that follow then describe what actually distinguishes a web server from a
database server, which is the interesting content and is small enough to read.

## 12. Ratified decisions log

| Date | Decision |
|---|---|
| 2026-08-12 | Baselines are materialized by value with provenance; never a live pointer to a golden machine. No `blessedBy` — the app has no auth by permanent ratification |
| 2026-08-12 | `appliesTo` is a facet selector with reserved `class` (resolved) and `machine` pseudo-keys; `{}` matches the fleet; class×stage is the common case, not the mechanism |
| 2026-08-12 | A machine's approved set is the union across all matching active baselines; no inheritance, no separate exemption concept — a one-machine baseline *is* an exemption |
| 2026-08-12 | Entry key is (displayName, architecture, installScope); SID dropped and publisher informational because a cross-machine key is a different problem from a same-machine diff key |
| 2026-08-12 | `systemComponent` entries excluded from comparison; versions never compared — identity only, `observedVersion` is provenance |
| 2026-08-12 | Only the extra direction produces findings; missing-direction parked |
| 2026-08-12 | One rolled-up `unapproved-software` finding per machine, not per app — protects the no-lifecycle ruling |
| 2026-08-12 | Unbaselined machines produce no finding, but baseline coverage ("N of M in scope") is stated wherever deviation counts appear |
| 2026-08-12 | Rollout: fleet-wide common baseline first, per-class baselines after |
