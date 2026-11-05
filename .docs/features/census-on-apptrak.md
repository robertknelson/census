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

### 3.1 C-1, built (2026-11-05): every Census SQL path on command/query

Robert, 2026-11-05: "Let's get census moved into command query." Every service that ran SQL now does so through the
handlers: Move It's questions, board, entry and curate writes; membership and the role list; the reset; Log Explorer,
Trace and Usage. Feature access keeps the data layer of its FM2280 copy (CA-3: it converges on FM2280 itself).

| File | What |
|------|------|
| `CommandQuery/Abstractions.cs`, `Parameters.cs`, `Response.cs` | Gatehouse's ports of xf-dashboard's contracts, signatures kept. `IInitializerLocator.GetShape` and `ResultShape` added. |
| `CommandQuery/Initializers.cs` | The base initializer with `Script(key, file, shape, parameters)`, the container (it refuses two claims on one key, a key with no shape, and a parameter named `@Key`), and the key extensions |
| `CommandQuery/JsonHandlers.cs` | `JsonQueryHandler`, `JsonCommandHandler` (with `TransactionAsync` for several keys in one transaction), `LogsQueryHandler`, and `SqlScripts` |
| `CommandQuery/CensusInitializers.cs` | 80 keys in six areas: `board.*`, `question.*`, `moveit.lists`; `entry.*`; `edit.*`; `membership.*`; `reset.*`; `logs.*`, `trace.*`, `usage.*` |
| `CommandQuery/ResponseExtensions.cs` | `Key(...)`, `.By(actor)`, `.Rows()`, `.Json()`, `.ToWriteResult()`, so the services return what their controllers already return |
| `Services/*` | `MoveItQuestions`, `MoveItEntry`, `MoveItEdit`, `MembershipAdmin`, `AssertionReset`, `LogReader`, `TraceReader` and `UsageReader` call keys. `ScriptRunner` is gone; `WriteResult` stays. |
| `apptrak/sql/membership/app-part-delete.sql` | `@Key` renamed `@PartKey` (see below) |
| `tests/Capture-Api.ps1`, `tests/Capture-Entry.ps1` | Save every SQL-backed read, and a run of every Move It entry write (inside a reset and restore), so before and after can be compared |

**Different from Gatehouse, and why:**
- **The result shape is declared with each key** (Rows, Json, Scalar), not guessed from the script's text. Gatehouse's
  guess (its G3, Potemkin's anti-pattern 3) would have misread the reset script, which mentions `FOR JSON` only inside
  dynamic SQL.
- **A row keeps each column's name as the script wrote it**, where Gatehouse camel-cases it. Census's pages read the
  names as written, and this was a move, not a redesign.
- **A Json answer is SQL Server's text**, served byte for byte (feature picture).
- **Scripts stay in `apptrak/sql` and are read from disk**, not embedded. `sqlcmd` setup runs the same files. They are
  cached once read, except in Development, where an edited script takes effect on the next call, as before.
- **THROW 50410 maps to 409**, as Potemkin's refusal contract has it.
- **Two connections by settings section**: `MoveIt` for AppTrak and `Logs` for the log tables, which falls back to
  AppTrak's as the readers did.

**Found on the way:** `app-part-delete.sql` took `@Key`, which is the same name as the bag's dispatch `key` (the
bag ignores case), so the delete overwrote its own command key. It is renamed `@PartKey`, and the container now
refuses a parameter named `@Key` at start-up.

**Verified (2026-11-05, local AppTrak and CensusLogsDemo):**
- **Reads.** `Capture-Api.ps1` before the move and after: all 59 answers are identical, except two kinds of
  difference that are not the code's:
  - `daysThere` in the feature picture is computed from now, and an hour passed between the runs.
  - Four lists (membership members and applications, the two recent-audit lists) changed because the test suites
    ran between the captures. `Test-Membership` re-seeds the demo members and applications, so the same rows come
    back with new ids and the same counts.
  - Two runs before the move, minutes apart, were byte-identical, which shows the capture itself is deterministic.
- **Writes.** `Capture-Entry.ps1`: every Move It entry write's answer and every row left behind are identical
  before and after (21 calls, refusals included).
- **Rollback.** A `name-build` whose second step fails (a title longer than the column) answers 500 and leaves no
  release behind: the transaction rolled back.
- **Suites.** `Test-Identity` 21, `Test-Reset` 23, `Test-Edit` 30, `Test-Membership` 32.
- **`Test-Identity` hardening.** Its anonymous checks now use a fresh client. Negotiate authenticates the connection,
  so a pooled connection signed in by an earlier suite in the same PowerShell process passed as anonymous.

**Not done:**
- Controllers still call services, which call keys. Moving the controllers to build the parameters themselves, as
  xf-dashboard's do, is a later step if you want the services gone.
- Feature access stays on its own data layer (CA-3).
- No unit tests for the container's start-up refusals: Census.Web has no test project yet.

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
    plus system-administrator on Census (the fixed rule the other Administer pages use, not a feature; see §5.1). The script refuses unless the database
    carries the extended property `AllowAssertionReset = 1`, set by hand once per non-production AppTrak.
  - UX: shown on the Administer page only when the server says it is allowed. The user types the word RESET and a
    reason. There is no browser confirm dialog.
- **One transaction.** The result names each table and how many rows it removed.
- **After a reset** the Move It board shows empty releases over the observed builds, which is the clean slate
  he asked for. The demo manifests can be reloaded with `Invoke-AppTrakManifests.ps1`.

### 5.1 R-1, built (2026-11-05)

| File | What |
|------|------|
| `apptrak/sql/reset/001-reset-schema.sql` | `reset.AssertedTable` (the one list of what a reset wipes, with the order), `reset.Reset`, `reset.Snapshot`. Idempotent. |
| `apptrak/sql/reset/002-arm-reset.sql` | The database's key: extended property `AllowAssertionReset = 1`. Run by hand; the file says how to disarm. |
| `reset-assertions.sql`, `restore-assertions.sql` | The reset and its undo, each in one transaction. Both refuse 50410 when the database is not armed. The reset refuses 50400 with no reason. The restore refuses 50404 for an unknown reset, and 50410 when the reset is already restored or when an asserted table holds rows. |
| `armed.sql`, `tables.sql`, `resets.sql` | The status: armed or not, rows now per asserted table, the resets so far |
| `Services/AssertionReset.cs`, `Controllers/Api/ResetController.cs` | `GET api/admin/reset` returns the status with `allowed` and `why`, decided on the server for the member viewed as. `POST api/admin/reset` takes `{ confirm: "RESET", reason }`. `POST api/admin/reset/{id}/restore` undoes one. |
| `wwwroot/js/reset/reset-page.mjs` | *Administer → Reset*: what would be wiped and its rows; the form only when allowed, otherwise why not; the resets so far with *Restore* |
| `appsettings.Development.json` | `Reset:Allowed: true`. Development only, absent everywhere else. |
| `tests/Test-Reset.ps1` | The SQL half on a scratch copy (16 checks) and the API half (10 checks) |

**Deviations from §5 as written, and why:**
- **Offered by the fixed rule, not a feature `admin.reset`.** The other Administer pages (Membership, Feature access) are
  offered to system-administrator on Census by a fixed rule, so they cannot be switched off from inside themselves
  (FM2280 D7). The reset follows the local form. Unlike those pages, its API checks the role on the server (403),
  rather than letting every request through until sign-in.
- **On `ScriptRunner`, not command/query.** C-1 brings the plumbing. `ScriptRunner` now maps 50400 to 400 and 50410
  to 409 (Potemkin `sql-refusal-to-http-status`), so the reset's refusals are not 500s.
- **The restore goes into empty tables only.** Anything written since the reset would collide on ids. Reset again
  first (that keeps the newer rows too), then restore. The page says so.

**Verified:**
- `Test-Reset.ps1 -BaseUrl http://localhost:5292 -NotAdmin demo-paula`: 26 passed, 0 failed.
  - A scratch database holding a copy of the local Move It rows (80 asserted rows, 39 deployments).
  - Unarmed: refused, nothing touched.
  - Armed: the asserted tables are emptied and `moveit.Deployment` is unchanged.
  - Reset again, then restore: identical to before by SHA-256 of each table's `FOR JSON`, ids and all.
  - A new row after a restore takes an id above every restored one.
  - The API refuses a product owner (403), a missing RESET or reason (400), and a second restore (409).
  - On the local AppTrak, a reset and its restore leave it as it began.
- Atomic to readers. A status read during a reset held open for 6 s blocked, then saw every table at 0. A status read
  during a restore held open saw every row back. Neither saw a half state.
- Live, headless Edge at 1400 px wide:
  - Sam (system-administrator) gets *Reset* under Administer. The page shows 80 rows; the button stays disabled until
    RESET and a reason are typed.
  - After a reset: every count is 0, the Tracker reads "Nothing on the way", and the reset is listed with *Restore*.
  - Paula (product owner) has no *Reset* in her menu, and `?at=admin.reset` lands her on the Tracker.

**Not verified:**
- Typing into the form and clicking in a browser. The clicks were exercised through the API.
- Phone width.
- The `Reset:Allowed` off case through the API. It would need a restart under another environment. The check is one
  line in `ResetController.Refused`.
- One headless shot taken while my API calls were still running showed a mixed state (`WorkItemLink` at 0, the rest
  full). I could not reproduce it under control (above) and believe it was the overlapping runs, but I cannot
  explain it fully.

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

## 10. Identity and impersonation (D-005; spec 2026-11-05)

### 10.1 Where Census stands

Census has no sign-in (personas P12). *View as* is a dropdown that sends `X-Census-Member`, which any client can set:
it works like impersonation with no identity under it and no guard on it. Ownership (§7) and the reset's role check
(§5.1) both trust that header today. Real impersonation needs real identity first.

### 10.2 What xf-dashboard does (read 2026-11-05; read only, nothing changed there)

`.docs/features/auth-and-impersonation.md` §4 and §9, `ClaimsTransformer.cs`, `api/UserAccessController.cs`:

- **Windows Negotiate**, then an `IClaimsTransformation` that keeps a `UserSession` per real `DOMAIN\user` in a
  cache. The session holds two identities, **canonical** (the real user) and **effective** (who requests run as).
- **Impersonate** (sys-admin only, `Impersonation:IsEnabled`) overwrites the cached session's effective user and
  roles with the target's. **Stop** resets them to canonical and is authorized on the *canonical* roles, so it always
  works. Self-impersonation is refused.
- **Effective roles are the target's exactly**, plus `sys-admin` carried through from canonical so the way out is
  always reachable. A target with no roles gets `visitor`, and the carry-through is added after that.
- **A banner on every page** names the person and holds *Stop*; the header gets a warning edge.
- **The effective user is the actor** (their decision 011): reads scope by it and writes record it, so impersonating
  reproduces what the user sees.
- A second, config-only path (`Impersonation:Identifier`) runs a developer as a fixed person.
- Their own security review (`auth-impersonation-security-review.md`) leaves these open:
  - impersonated actions are attributed only to the target (Finding 1, High);
  - start and stop log lines carry no session id (Finding 2);
  - nothing stops the config path in Production (Finding 3);
  - impersonation silently ends when the cache entry expires (Finding 5).

### 10.3 What Census takes

- **The identity half from Gatehouse, not straight from xf-dashboard.** `Gatehouse.Web/identity/` is xf-dashboard's
  shape already ported to AppTrak's `membership` (G-R11). It brings Negotiate, `ClaimsTransformer`, `UserSession`,
  `MembershipAuthProvider`, `Authorization:SystemAdministrators`, and a five-minute session so grants arrive without
  a restart. Census keeps its own rule that a role on the Census application counts estate-wide.
- **The impersonation half from xf-dashboard:** canonical and effective identities on the session, impersonate and
  stop, the sys-admin carry-through, the visitor fallback, the `IsEnabled` switch, and the banner. Rewritten to
  Census's form (ES6 modules, no widget framework), not copied.
- **Their open findings fixed from the start, not inherited:**
  - **Finding 1:** every audited write records the effective user as `ChangedBy` (their decision 011 kept) **and**
    the real user when they differ, in a nullable `ImpersonatedBy` column on each audit table (CA-7).
  - **Finding 2:** start and stop are AppEvents (`impersonation-started` / `impersonation-stopped`) carrying both
    identities and the session id.
  - **Finding 3:** no config-only path. Locally, *View as* becomes impersonation itself, so it is not needed (CA-8).
  - **Finding 5:** the impersonation target is kept beside the session. When the five-minute refresh rebuilds the
    session, it re-resolves the target's roles and keeps impersonating, rather than silently dropping back.
- **`X-Census-Member` goes away.** The actor comes from the signed-in principal everywhere: the reset, the curate
  pages, membership, feature access. *View as* stays as the control, now offered only to a system administrator and
  backed by the impersonate API.

### 10.4 Slices (before C-1 and O-1, because both need a real actor)

| Slice | What | Verified by |
|-------|------|-------------|
| I-1 | Identity: Negotiate, plus the claims transformation and session from Gatehouse, and the sys-admin list. The actor comes from the principal. The header is retired. | Signed in as yourself, your roles come from AppTrak. A member with no role sees nothing gated. A forged `X-Census-Member` changes nothing. |
| I-2 | Impersonation: the API, *View as* on top of it, the banner and *Stop*, the carry-through, `ImpersonatedBy` on the audits, and the AppEvents. | As Sam, impersonate Paula: you see her nav and her applications, and get 403 where she gets 403. The banner shows. A write records Paula and you. *Stop* returns you to yourself. A non-admin's impersonate is 403. With `IsEnabled` off there is no *View as*, and the API answers 403. |

### 10.5 Open items

| # | Question | Call (under GO; reverse by saying so) |
|---|----------|---------------------------------------|
| CA-7 | How a write records the real user while impersonating | **A nullable `ImpersonatedBy` on each audit table** (`moveit.EditAudit`, `membership.MembershipAudit`, `fm.FeatureAudit`), passed as a second parameter. Their decision 011 stays: `ChangedBy` is the effective user. This is a schema change on three tables, two of them shared with FM2280 and Gatehouse, so it is flagged for you. |
| CA-8 | Keep xf-dashboard's config-only dev persona? | **No.** *View as* (I-2) does the same at runtime, with a banner, and one path is less to guard in production (their Finding 3). |
| CA-9 | Can a system administrator impersonate another system administrator? | **Yes**, as in xf-dashboard §9.5. The `ImpersonatedBy` stamp is what makes that safe. |
| CA-10 | Census has no visitor page. What does impersonating a member with no role show? | **What that member would see:** Overview only, plus the banner with *Stop*. The carry-through keeps Administer. |

### 10.6 I-1 and I-2, built together (2026-11-05)

Robert, 2026-11-05: "Change what you have to in the tables to make this happen. Go" (CA-7 ratified: the column on all
three audit tables).

| File | What |
|------|------|
| `apptrak/sql/identity/001-impersonated-by.sql` | `ImpersonatedBy nvarchar(100) NULL` on `moveit.EditAudit`, `membership.MembershipAudit`, `fm.FeatureAudit`. Idempotent; nullable, so FM2280's and Gatehouse's writers keep working. |
| 22 audit inserts in `apptrak/sql/edit`, `membership`, `fm` | Write `@ImpersonatedBy` beside `@Actor` |
| `Identity/CensusIdentity.cs` | Options, claims, the `Actor` pair, the session (canonical user, five minutes), `ImpersonationStore` (the target per real user, kept apart from the session, sliding `Impersonation:Hours`, default 8), `ClaimsTransformer` |
| `Controllers/Api/ImpersonationController.cs` | `POST api/impersonation { identifier }` and `POST api/impersonation/stop` |
| `PersonasController` | `GET api/personas/me`: who, acting as whom, that member's access, `administer`, `canImpersonate`, all decided on the server. The member list and any one member's access are now for administrators only. |
| `Program.cs` | Negotiate, every request signed in (fallback policy), the `CensusAdminister` policy, and feature access's admin policy made a real check. `appsettings.Local.json` (git-ignored) holds your account in `Authorization:SystemAdministrators`. Environment variables and the command line still outrank it. |
| `ScriptRunner`, `MoveItEdit`, `MembershipAdmin`, `AssertionReset`, FM's `FeatureCommandHandler` | Take the `Actor` pair, not a string |
| `EditController`, `MembershipController`, `ResetController`, `FeatureAccessController` | The actor comes from the principal. `X-Census-Member` is gone. Membership answers 403 to a non-administrator. |
| `personas-page.mjs`, `personas-api.mjs`, `personas.css` | *View as* only when the server offers it, driving the impersonate API; the banner with *Stop* and the header's warning edge; a page for a signed-in user who is not a member |
| `tests/Test-Identity.ps1` | Three modes: Admin (21 checks), NonAdmin (13), Disabled (7) |
| `Test-Edit.ps1`, `Test-Membership.ps1`, `Test-Reset.ps1` | Sign in, and act as demo-sam by impersonation in place of the header |

**Deviations, and why:**
- **Start and stop are logged through `ILogger`, not as AppEvents.** Census has no AppEvent sink; Gatehouse has one.
  Both identities and the session id are on each line (Finding 2). Moving these to AppEvents waits on Census having
  that sink.
- **The banner is on the persona shell only.** The other pages (Estate, Atlas, Day, Move It, Logs, Trace, Usage) now
  require sign-in, but they neither scope by user nor show the banner.
- **The identity resolution reads membership through `MemberAccess`**, not command/query. C-1 brings the plumbing.
- **`ImpersonatedBy` is recorded but not yet shown** in the history lists (curate, membership, feature access).

**Verified (2026-11-05, local AppTrak, signed in as yourself):**
- `Test-Identity.ps1`:
  - **Admin, 21 passed.** Without credentials: 401. A forged header changes nothing. Impersonating yourself is 400;
    an unknown member is 404. As demo-paula you see only her two applications and none of her missing features,
    and Administer carries through. A write as her lands with `ChangedBy` demo-paula and `ImpersonatedBy` you on all
    three audit tables. *Stop* returns you, and a write as yourself leaves `ImpersonatedBy` NULL.
  - **NonAdmin, 13 passed.** View as and Administer are not offered. Impersonate, stop, the member list, membership,
    feature access, reset and restore all answer 403.
  - **Disabled, 7 passed.** View as is not offered, impersonate is 403, stop is 200.
- `Test-Reset.ps1` 23 passed, `Test-Edit.ps1` 30, `Test-Membership.ps1` 32. Fourteen node suites pass.
- Headless Edge with Negotiate at 1400 px. As yourself: *View as* reads "Yourself" and Administer is offered. As
  Paula: the banner "Impersonating **Paula Product** [Stop]", the header's orange edge, her Tracker with Reporting
  and WidgetCore only, her nav, and Administer carried through.

**Not verified:**
- Clicking *View as* and *Stop* in a browser; impersonation was started through the API.
- Phone width.
- A second real Windows user. One account exists here, so the non-administrator is simulated by overriding the list.

**An incident during the build, recorded.** The first NonAdmin run happened before the configuration-order fix, so I
was still an administrator. Its "should be refused" `POST api/admin/reset` really ran, as reset #3 (13:20, reason
"x"), and emptied the local Move It tables.
- Recovered the way the reset is meant to be undone: reset #4 kept the four test audit rows written since, then
  #3 was restored. All 84 rows are back.
- `Test-Identity.ps1 -Mode NonAdmin` now stops before any refusal check if you turn out to be an administrator.

**Open, for you:**
- **Signing in now gates every page, the `demo` profile and ignite included.** Plinth's window and anything viewed
  from the road will answer 401 unless what fetches it carries Windows credentials.
- **The curate API accepts any signed-in user until O-1.** Impersonating Paula, a release could be written on an
  application that is not hers.
