# Approved Baseline — the inverse of the blacklist

> Status: ratified and built 2026-08-12. Proposed 2026-08-01, parked undiscussed; spec
> conversation held and open items decided the same day it shipped. §12 records what the
> fixtures cover and what could not be verified here.
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
        },
        {
          "displayName": "Symantec Endpoint Protection",
          "publisher": "Symantec Corporation",
          "architecture": "x64",
          "installScope": "machine",
          "observedVersion": "12.1.7454.7000",
          "required": true
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
  asserted present-as override wins over observed roles, so a machine that has been called a
  `WebServer` is judged as one whatever it runs. `machine` matches the machine name directly.
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

### 6.4 Both directions, with required as an explicit assertion on top of approved

*Approved* means "allowed here"; *required* means "must be here". They are different
assertions, and the reason the missing direction was parked at first is that conflating them
would make every optional tool on the source machine mandatory across the whole scope.

**Ratified 2026-08-12** (the parked item, resolved): required is a **`required: true` flag on
the entry**, defaulting false, absent meaning false. Not a separate artifact — the entry
already carries the identity, and the identity is the subtle part (§6.1); a second file would
duplicate that key model and then need its own selector and its own union semantics, which
`appliesTo` already solves. One bool, no migration, every existing file still valid.

- **Blessing never sets it.** Required is purely asserted; inferring a requirement from an
  observation would breach the observed-below/asserted-above line the semantic layer rests on.
  A bless therefore produces zero requirements, which is what keeps the two assertions apart.
- **Required wins across the union.** If any matching baseline marks an entry required, it is
  required on that machine, even where a narrower baseline merely permits the same thing. A
  requirement asserted anywhere holds — the safe direction, and the one the union already
  takes for approval.
- **Identity only, never versions**, exactly as §6.3: "the agent is present", not "≥ 7.2".
- **`not-judgeable` binds harder here.** Software that could not be collected makes *missing*
  unknowable, and nothing is emitted. The failure this prevents is worse than in the extra
  direction: "the AV agent is missing" because a permission lapsed is precisely the false
  alarm that destroys trust in the report.

## 7. The findings

One finding per machine per direction, **not one per item**:

| `kind` | `severity` | `title` | `detail` |
|---|---|---|---|
| `unapproved-software` | `medium` | `N unapproved items` | The deviating entries, enumerated |
| `missing-required-software` | `high` | `N required items missing` | The absent required entries, enumerated |

Both severities are provisional and inherit the unratified tier question (census-web.md §8).
**The asymmetry is deliberate** (ratified 2026-08-12): a required item is one a human
deliberately marked, so its absence violates something explicit, where an unapproved item is
merely unblessed.

**Two kinds, not one merged baseline finding** (ratified 2026-08-12). The remediations are
opposites — install something, versus remove or approve something — and `kind` is how the
dev-ops queue is routed. A machine can carry both.

**Why rolled up.** `blacklist-hit` fans out one finding per hit and should — a blacklist rule is
deliberately narrow, so each hit is a distinct thing somebody named. A baseline deviation is
open-ended: the first real machine will produce dozens, and findings have **no lifecycle** by
ratification (v2-UX §4 — no acknowledge, no snooze, recomputed every read). A per-app fan-out
is the single most likely thing to make raw truth drown the signal and force that ruling to be
reopened. Rolling up protects it.

The full lists live in the machine dossier, where a working list belongs; the findings stream
carries the counts and the pivot into them.

### 7.0 A requirement that matches nothing is a config error, not an estate failure

Mark `required` with a typo'd `displayName` and every machine in scope reports it missing,
forever. That is surfaced in the baselines panel as **"found on 0 of N"** beside the entry —
**not** as its own finding (ratified 2026-08-12). It is a config smell rather than a fact about
the estate, and it belongs where the mistake was made, next to the checkbox that made it.

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
  many machines each currently matches. Activate/retire, edit, delete. *Amended 2026-08-20
  after the field trial reported the list unreadable as it grows and creation undiscoverable:*
  the list is **grouped by scope shape** — fleet-wide, by class, other facet scopes, single
  machine — with the group derived from each baseline's `appliesTo`, never stored (a stored
  category would be the second grouping vocabulary §4 rejected); and the panel carries a
  **"Bless a new baseline…"** entry point — the dossier's gesture with a source-machine
  picker in front (scope and suggested id pre-seed from the chosen machine's class/stages).
  Materialize-by-value holds: there is deliberately no create-empty-and-type path, here or
  anywhere.
- **Machine dossier** — which baselines matched it, what it carries that none of them approve,
  and what they require that it does not have. The required-but-absent table is listed first:
  absence is the harder thing to notice.
- **Entries list in the baselines panel** — expandable per baseline, one `required` checkbox
  per entry, with "found on X of N" beside every required one (§7.0). The toggle is the only
  way required is ever set — nothing infers it.
- **"Approve here" on a deviation row** *(added during the build)* — appends that one entry to
  a baseline scoped to that machine alone, creating `<machine>-exemptions` if it does not
  exist, and **requires a note**. Without it §5's exemption had no UI path at all: blessing
  materializes a machine's whole set, which is the wrong gesture for allowing one item on one
  box, and the only alternative was hand-editing the file. Each approval's note is appended
  rather than replacing the last, so the second exemption cannot inherit the first one's
  justification.
- **Findings stream** — the rolled-up finding, with the coverage line from §7.1.
- **Software pivot** — the existing "where is X installed?" view gains an approved/unapproved
  marker, since it is already iterating the same data.

## 10. Open items

- ~~**Missing-direction findings**~~ — **resolved and built 2026-08-12** (§6.4). Ratified as a
  flag on the entry, not a separate artifact; required wins across the union; blessing never
  sets it.
- **Severity tiers** — `medium` for unapproved and `high` for missing are both provisional.
  Entangled with the unratified severity tiers (census-web.md §8) and with stage-aware severity
  (v2-UX §7): an unapproved package in prod and the same one on a dev laptop are not the same
  finding, and neither is a missing AV agent.
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

## 12. What the fixtures cover

The verification constraint holds (`census-web-v2-ux.md` §7): no real payload is reachable
here, so `output-demo/` plus `config/baselines.demo.json` are the coverage, and every branch
needs a fixture deliberately.

| Branch | Fixture |
|---|---|
| Empty selector matches the fleet | `fleet-common`, `appliesTo: {}` — 8 of 8 machines |
| class × stage | `web-prod`, `db-prod` — 2 machines each |
| Facet-only scope (no class) | `dev-stage`, `{ stage: [dev] }` — 3 machines |
| One-machine scope (the exemption) | `devbox-jsmith-container-work` |
| Union across three baselines | DEVBOX-JSMITH matches fleet + dev-stage + its exemption |
| Asserted class beats observed | APPSRV01 is observed WebServer+DatabaseServer, asserted `WebServer` (was `DevServer` until that class retired, 2026-08-25) — `web-prod` still does not judge it, but now on the stage mismatch (dev/qa vs prod), so this row covers the override's *provenance* more than its scope-matching effect |
| `systemComponent` excluded | WEB01's ASP.NET Core Module V2 and SQL01's engine entry are approved by nothing and deviate on nothing |
| Per-user install, different SID per machine | Slack on DEVBOX-JSMITH (`…-1417`) and APPSRV01 (`…-2209`), one baseline entry, no deviation on either — the §6.1 rule that would otherwise flood the stream |
| In scope but not judgeable | WEB02 (`insufficient-rights`) and BUILDSRV01 (`failed`) — matched, never rendered as approved |
| Clean in scope | WEB01, SQL01, SQL02, LEGACY-DC01 |
| Deviation → finding | APPSRV01 and DEVBOX-JSMITH, one rolled-up finding each |
| Required, present | Symantec on LEGACY-DC01 — the only machine carrying it, and the only one clean |
| Required, absent | the same entry on WEB01, SQL01, SQL02, APPSRV01, DEVBOX-JSMITH — "who is missing AV" answered by one flag |
| Two required items missing on one machine | SQL02, which also lacks the `db-prod` required entry |
| Required + not judgeable | WEB02 and BUILDSRV01 emit nothing — absence is unknowable when software was not collected |
| Required coverage signal | `found on 1 of 6` beside Symantec in the panel, so a requirement nothing carries reads as a config error |
| `required` absent from an entry | every other entry in the demo file omits the key — the default must be approved-only |

**Verified live rather than fixtured permanently**, because it is mutually exclusive with the
empty-selector fixture: retiring `fleet-common` moves coverage to 7 of 8 and LEGACY-DC01 to
`not-in-scope`, and a retired baseline still reports the 8 machines it *would* match. A demo
tree cannot hold both a fleet-wide baseline and a machine outside every scope.

Also exercised against the running app: bless (materializes entries with provenance), bless
refused from a machine whose software collection is `insufficient-rights` (a partial set must
never be blessed as complete), bless refused for an uncollected machine, approve-here refused
without a note, and PUT refused for a typo'd class value and for an empty value list — the two
selector shapes that would otherwise match nothing, silently.

**The rendered UI was verified in the browser** against the demo tree, in two passes — the
approved direction first, then the required one (entries list, `required` toggle writing
through to the file and moving the findings with it, "found on 1 of 6", and the dossier's
required-but-absent table on SQL01). Specifically, for the approved direction: the panel and
its coverage line, the scope editor (a chip added to one key leaves the others intact — the
draft survives a re-render), the dossier's judged-by row, the deviations table, the
`not-judgeable` render on WEB02, the approve-here flow end to end (rejected without a note,
accepted with one, after which the deviation cleared, the finding went, and the tile's count
dropped from 3 to 2), the bless form's pre-filled scope, and the software pivot's
`unapproved on N` badge — absent on Slack, which is per-user on two machines under different
SIDs and approved on both.

**A bug the fixtures caught, worth recording.** The per-entry presence counter keyed its
dictionary on `$"{baselineId} {entryKey}"`, and the character between the two parts was a
literal NUL rather than the space it looked like — invisible in the editor and in a diff. The
write and the read composed it differently, so every `presentOn` came back 0 while every other
number was right. Fixed by keying on a `(baselineId, entryKey)` **tuple**: two halves that
cannot drift apart on a separator that is not there. Composed string keys are worth avoiding
for exactly this reason.

One defect surfaced in the browser and was fixed there: `.est-error` was declared *before* `.est-status` in
`estate.css`, and every editor writes failures as `class="est-status est-error"`. At equal
specificity source order decides, so the muted rule won and **every error message in the app
rendered as quiet gray**. Not specific to this feature — it was simply the first time anyone
looked at an error on purpose.

## 13. Ratified decisions log

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
| 2026-08-12 | Approve-here on a deviation row is the exemption's UI path, note required — added during the build because §5 otherwise had no gesture and only hand-editing would do |
| 2026-08-12 | Missing direction ships as `required: true` on the entry, not a separate artifact; blessing never sets it; required wins across the union; identity only, never versions |
| 2026-08-12 | `missing-required-software` is its own kind at `high`, not merged with `unapproved-software` at `medium` — opposite remediations, and a required item is one somebody deliberately marked |
| 2026-08-12 | A requirement matching nothing in scope surfaces as "found on 0 of N" in the panel, never as a finding — a config error belongs next to the checkbox that made it |
| 2026-08-20 | "Per-type baseline" needs no schema — the reserved `class` selector already is it. The field-trial gap was UI: bless reachable from the Baselines panel (source-machine picker + the same form), and the list grouped by scope shape derived from `appliesTo`. No stored category, no create-empty path |
