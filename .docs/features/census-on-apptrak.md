# Census on AppTrak — command/query, one role list, scoped ownership, the reset

Spec, 2026-11-05. Decisions D-001 to D-004 in `../decisions.md`. Nothing built yet.

## 1. The ask (Robert, 2026-11-05)

Census and Move It are growing toward an enterprise solution. Four rulings:

1. Census moves to command/query handlers (D-001).
2. Development runs against AppTrak. `core.SelectItem` holds the real roles, and roles, `membership` and `fm` stay
   synchronized through it (D-002).
3. One call wipes everything not obtained by observation, so real user workflow can be watched from a clean slate (D-003).
4. Product owners add their own releases and features and see only their own (D-004).

## 2. What is observed and what is asserted

The reset keys on this table. Every new table must be placed in it in the same commit.

| Kind | Where | Through a reset |
|------|-------|-----------------|
| **Observed** | Census collector output (`output/`), AppTrak health responses and `apptrak.*` logs, `moveit.Deployment`, `moveit.BackfillRun`, `apptrak.AppEvent` | Kept |
| **Identity and configuration** | `core.SelectItem`, `membership.*` (including `MembershipRequest`), `fm.*` | Kept |
| **Asserted: Move It** | `moveit.Release`, `WorkItem`, `ReleaseBuild`, `ReleaseEvent`, `WorkItemLink`, `EditAudit` | Wiped |
| **Asserted: Census layer** (still files today) | `config/*.json`: entity-tags, systems, declared-entities, stage-crossings, baselines, assets, machines, blacklist, views | Wiped once moved (§6); until then, untouched |

`moveit.Deployment` is derived from the health responses and regenerable by the backfill, so it counts as observed.

## 3. Command/query

- The plumbing is Gatehouse's `command-query/` (key-dispatched handlers, `.sql` scripts, values as parameters,
  result shape detected), copied into Census.Web. FM2280's `data/` follows the same idea (CA-3).
- Migration is gradual, not a big-bang rewrite. Each existing `Services/*` that touches SQL (`MoveItEdit`,
  `MoveItEntry`, `MoveItQuestions`, `MembershipAdmin`, `MemberAccess`, `UsageReader`, `LogReader`, `TraceReader`) moves
  in a slice of its own. File-backed stores move when their data does (§6).
- Every new endpoint gets its gate in the same commit, and both halves are enforced (UX and server).

## 4. One list of roles

- `core.SelectItem` `member-types` is the only definition of a role. `membership.MemberApplicationRole.RoleId` and
  `fm.FeatureRole` both refer to it. `MemberTypesRoleCatalog` already reads it for the feature access page.
- Synchronized means: no role exists in `fm` or `membership` that is missing from the list, and a role retired
  from the list shows on the membership page's **Needs a word**, never silently dropped. A check script reports any
  drift (CA-4).

## 5. The reset (D-003)

- **One call:** `POST api/admin/reset`, and a script `apptrak/sql/reset/reset-assertions.sql` that does the same,
  for use without the app.
- **Soft:** before it deletes, the reset writes every row it is about to remove into `reset.Snapshot` as JSON, one
  row per table: `ResetId, TableName, RowsJson, RowCount, At, By, Reason`. `restore-assertions.sql @ResetId` puts
  them back with their ids (`IDENTITY_INSERT`). Undoing is possible; nothing is lost.
- **Guarded on both halves:**
  - Server: refused unless the setting `Reset:Allowed` is `true` (default false, absent from production config),
    plus feature `admin.reset`, held by system-administrator only. The script refuses unless the database
    carries the extended property `AllowAssertionReset = 1`, set by hand once per non-production AppTrak.
  - UX: shown on the Administer page only when the server says it is allowed. The user types the word RESET and a
    reason. There is no browser confirm dialog.
- **One transaction.** The result names each table and how many rows it removed.
- **After a reset** the Move It board shows empty releases over the observed builds, which is the clean slate
  he asked for. The demo manifests can be reloaded with `Invoke-AppTrakManifests.ps1`.

## 6. Census's assertion layer into AppTrak

- A schema of its own, `census`. The 2026-09-14 projection schema becomes the real thing rather than a disposable copy.
- One file per slice, in the order the UI writes them: entity-tags first (it carries system, stage and `serves`,
  which the board needs), then systems, stage-crossings, declared-entities, machines, assets, baselines, blacklist,
  views.
- Each table gets an audit in the `PreviousValue` / `NewValue` pattern, which replaces git as the history.
- The demo JSON files become seed scripts. The fixture tests run against a seeded scratch database.
- The tag shape is still moving, so `census.EntityTag` keeps the flexible part as a JSON column with a fixed key
  (entity kind plus identity). It avoids an `ALTER` every time an axis changes (CA-5).

## 7. Scoped ownership (D-004)

- A release belongs to an application (`moveit.Release.ApplicationId`, already present). **A person's own releases
  are those of the applications on which they hold product-owner or application-owner.** This is the same scope
  rule as Usage U-R1 and personas §6. A system administrator sees all of them. (CA-1)
- The server decides. Lists are trimmed in SQL by the member's scope. A read or write for a release outside the
  scope gets 403, and the save scripts refuse it too. The UX offers only applications in scope on *New release*.
- Every Move It write records its author: `CreatedBy` already exists, and `EditAudit` keeps `ChangedBy`.

## 8. Slices

| Slice | What | Verified by |
|-------|------|-------------|
| R-1 | The reset over Move It's tables: snapshot, wipe, restore, both guards, the API and the Administer control | Seed, reset, board empty, restore, board identical (row counts and a hash per table). Refused with the setting off. Refused by the script without the extended property. |
| C-1 | Command/query plumbing in Census.Web; `MoveItEdit` and `MoveItEntry` onto handlers | Board and curate pages give the same answers before and after (API diff, as Gatehouse G-3 did) |
| O-1 | Scoped ownership on Move It reads and writes | A product owner of WidgetCore sees and edits WidgetCore alone and gets 403 on another application; a system administrator sees all |
| S-1 | Role drift check (§4) | Script reports a planted orphan role |
| T-1 … | Census layer, one file per slice (§6), each joining the reset | Fixture tests green on the seeded database; the reset clears it |

R-1 comes first because it is small, touches no existing code path, and serves what he wants now: watching real
workflow from a clean slate.

## 9. Open items

| # | Question | Call (under GO; reverse by saying so) |
|---|----------|---------------------------------------|
| CA-1 | "Their own": by application role, or by who created the record? | **By application role.** A product owner who leaves would otherwise orphan their releases, and two owners of one application need to see each other's work. The creator is still recorded. |
| CA-2 | Does the reset also clear membership requests, grants or feature roles? | **No.** Those are who people are, not what they told us about the estate. Wiping them would lock him out mid-test. |
| CA-3 | Feature access: Census's own `FeatureAccess/` or a reference to FM2280? | **Keep Census's own for now** and converge on FM2280 after his changes to it land. Taking a moving dependency mid-migration doubles the churn. |
| CA-4 | Drift check: a report, or enforced by foreign key? | **A report.** `fm.FeatureRole` holds the role identifier, and AppTrak's real `core.SelectItem` is not ours to constrain. |
| CA-5 | Census tags: columns per axis, or a JSON column? | **JSON for the axes, columns for the key.** The shape changed three times in two months. Revisit when it holds still. |
| CA-6 | Is `Reset:Allowed` only for local AppTrak, or also for his work dev AppTrak before go-live? | **Both, by hand.** The database's extended property is the second key, so a copied config file alone cannot arm it in production. |
