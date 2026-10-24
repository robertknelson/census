# Gatehouse — a reference app for porting Feature Management, Membership and Logs

Status: **G-1 built 2026-10-23** (the shell: Windows sign-in, the claims transformation, command/query, the sidebar, Feature Management and its gates); **G-2 built 2026-10-24** (Membership); **G-2b built 2026-10-24** (the visitor welcome and the request to join, §11); **G-3 built 2026-10-24** (Logs, §9c); **G-4 written 2026-10-24** (a `PORTING.md` in each component's folder, §9d, and the package, §9e); **AppEvent (§12) and the rest of Usage (§13) specced 2026-10-24, building.**

## 1. The ask (Robert, 2026-10-23)

"What i am trying to do (big picture) is to implement Feature Management in a live app that does not have it yet,
but does use a sidebarNav, Windows Authentication (with claims transformation) where the DOMAIN\\Username, the
Username is the Identifier … the link to membership.Member.Identifier. I want the completely separate application so
it's easier for me to see things clearly and to port the components. The target live app uses Command Query
Handlers, and already uses ILogger and serilog to log to apptrak.ApiRequest etc."

A separate ASP.NET 8 site with a left sidebar, holding three components: **Feature Management**, **Membership**
and **Logs**. It does **not** use Census's `ScriptRunner`; it uses xf-dashboard's command/query handlers, made async.

## 2. Rulings

| # | Ruling | Consequence |
|---|---|---|
| G-R1 | **A reference implementation for porting** into a live app that has a sidebar partial, Windows sign-in with a claims transformation, and command/query handlers. | Gatehouse reproduces that shape. Every component is a set of folders to lift, with a porting note. |
| G-R2 | **No impersonation.** | No "view as". The page answers for the signed-in Windows user only. |
| G-R3 | **`DOMAIN\username` → `username` = `membership.Member.Identifier`.** | The claims transformation strips the domain and looks the member up by identifier. |
| G-R4 | **Roles are `core.SelectItem` identifiers (the `member-types` list), held per application** in `membership.MemberApplicationRole`. | A user's role claims are the roles they hold on *this* application (§5). |
| G-R5 | **The same command/query pattern as xf-dashboard**, any namespace ("i'll likely be changing them when i port"). | §4. |
| G-R6 | **Async handlers.** | `QueryAsync` / `ExecuteAsync` are real (xf-dashboard's throw `NotImplementedException`). |
| G-R7 | **A peer of Census.Web in this repo is fine.** | `Gatehouse.Web/` beside `Census.Web/` (§3). |
| G-R8 | **Gatehouse, port 5296** (G1: "agreed"). | §3. |
| G-R9 | **`fm` serves one application** (G2: "NO, it is only for 1 app"). | Feature names carry no application prefix (`logs.explorer`, not `gatehouse.logs.explorer`). Locally, where AppTrak's `fm` is already Census's, Gatehouse's `fm` lives in a database of its own (§8). |
| G-R10 | **FM2280's data layer moves onto command/query** in Gatehouse (G4: "yes"). FM2280 itself is unchanged. | §6. |
| G-R11 | **The live app's claims transformation is essentially xf-dashboard's** (G6). | Gatehouse copies its shape (§5): `IClaimsTransformation`, a per-user session cache, an auth provider that resolves the person and roles, the configured sys-admin list; without impersonation (G-R2). |

## 3. Shape

- **`Gatehouse.Web/`**, an ASP.NET 8 MVC project beside `Census.Web/`, port **5296** (no other project's dispatch
  names it; Census is 5292). It references nothing in Census.Web: what you see is what you port.
- **`_Layout.cshtml` + `_SidebarNavPartial.cshtml`**, server-rendered, as in the live app.
- **One component per folder** (namespaces are Gatehouse's own; you will rename them when porting), each with its C#, `.sql` (embedded resources), views, `.mjs` and CSS together:

| Folder | Holds |
|---|---|
| `command-query/` | The handler core (§4): the interfaces, the async query and command handlers, the initializer locator, `Parameters`, `Response<T>`. In the live app this already exists; it is here only so Gatehouse runs. |
| `identity/` | The claims transformation (§5). In the live app, the lines to add to its existing transformation. |
| `feature-management/` | FM2280's evaluation (SQL definition provider, claims targeting, the disabled-feature handler, the gate scanner), its admin API and page, the nav declaration and the sidebar filter (§6), all on command/query. |
| `membership/` | Census's membership admin (applications, members, grants, the parts an application has, audit) on command/query. |
| `logs/` | Log Explorer, Trace and Usage on command/query: the same SQL as Census's `apptrak/sql/logs`, the same pages. |

- **Data:** AppTrak only: `fm`, `membership`, `core.SelectItem`, and the log tables under `apptrak.*`. No new tables.
- **The live app already logs** through ILogger/Serilog to `apptrak.ApiRequest` etc. Gatehouse writes no logs of its
  own; its Logs pages read what is there.

## 4. Command/query

xf-dashboard's pattern 2 (`.docs/data-access.md` there), with its signatures kept so ported code compiles against
the live app's:

- `IJsonQueryHandler { Query(IParameters); QueryAsync(IParameters); }` and
  `IJsonCommandHandler { Execute(IParameters, JsonNode); ExecuteAsync(IParameters, JsonNode); }`, returning
  `Response<JsonNode>`.
- `ISqlCommandInitializer { Domain; Dictionary<string, Action<SqlCommand, IParameters, JsonNode>> Initializers; }`: a
  key (`domain.name.action`, e.g. `gatehouse.feature.list`) picks a delegate that loads an embedded `.sql` and binds
  its parameters.
- **Dedicated controllers per feature**, the "preferred" shape in xf-dashboard's doc, not the catch-all
  `CommandQueryController`. Bodies arrive as `[FromBody] JsonNode` and pass through untouched.
- **Async for real (G-R6):** the async methods open, execute and read asynchronously; the sync ones stay, implemented
  directly rather than by blocking on the async ones.
- **Result shape stays as xf-dashboard detects it** (`FOR JSON` → scalar, `OUTPUT`/`SCOPE_IDENTITY` → rows, else
  non-query). Declaring the shape in each initializer would be safer, but it changes the initializer's signature and
  the ported initializers would no longer fit the live app's interface. Open item G3.
- **Logs' dynamic SQL fits as it is:** the search initializer binds the JSON filter parameter; the script checks the
  column names, as now.

## 5. Identity

- **Windows authentication** (Negotiate). The name `DOMAIN\username` gives `username`.
- **The claims transformation has xf-dashboard's shape (G-R11):** an `IClaimsTransformation` that splits
  `DOMAIN\username`, keeps a session per user in a cache, and asks an **auth provider** to resolve the person and
  their roles on a cache miss. Gatehouse's auth provider reads `membership` through command/query: the member by
  `Identifier = username`, and one role per `member-types` identifier they hold on **this application** (their
  `MemberApplicationRole` rows for the `membership.Application` whose identifier is the setting
  `Identity:Application`). The roles become `ClaimTypes.Role` claims, beside the identifier and name claims, as in
  xf-dashboard. Census's rule that a role on Census counts estate-wide stays in Census.
- **The configured sys-admin list** (`Authorization:SystemAdministrators`), as in xf-dashboard: a listed identifier
  gets `system-administrator` without a grant row. It is how the first person reaches the admin pages.
- **The session cache expires** after `Identity:SessionMinutes` (default 5), so a grant made on the Membership page
  reaches its holder within minutes, with no restart and no sign-out.
- **No impersonation** (G-R2): xf-dashboard's impersonation paths are left out.
- **No member, or no roles here:** signed in with no role claims. The sidebar shows only what needs no feature, and
  every gated endpoint refuses.
- The role claims are FM2280's targeting groups as they are (`ClaimsTargetingContextAccessor` reads the role claim
  type), so evaluation needs no change.

## 6. Feature Management, the sidebar and the gates

- **One nav declaration in C#**: group, label, route and feature for each item. `_SidebarNavPartial.cshtml` loops over
  it and shows an item when `IFeatureManager.IsEnabledAsync(feature)` is true for the signed-in user. It is not
  xf-dashboard's `@if` per link.
- **Every endpoint behind a nav item carries the same feature** (`[FeatureGate]`), and every other endpoint carries a
  named policy. Deny by default. A test fails when any controller or action has neither (G-R1 and your rule that
  controls live on the UX and the server).
- **The Feature Access admin page and API sit behind a fixed policy**, never a feature, so the way back cannot be
  switched off (FM2280 D7). The policy is a role on this application (the setting `FeatureAccess:AdminRole`, default
  `system-administrator`).
- **The gate scanner** (FM2280's) warns on the admin page about any gate naming a feature that does not exist.

## 7. The pages

| Nav | Page | Feature |
|---|---|---|
| Home | Who you are: identifier, the roles here, the features on for you | none |
| Logs → Log Explorer | Census's `/logs` | `logs.explorer` |
| Logs → Trace | Census's `/trace` | `logs.trace` |
| Logs → Usage | Census's `/usage`, every application in the logs (no persona scoping) | `logs.usage` |
| Administer → Membership | Census's membership page | `admin.membership` |
| Administer → Feature access | FM2280's page | fixed policy (§6) |

## 8. Local runs

- **Your local AppTrak** for `membership` and `core.SelectItem`, with Census's demo seeds
  (`apptrak/Invoke-AppTrakDemo.ps1`) plus the `gatehouse` application in `membership.Application`.
- **Gatehouse's own `fm`** in a local database of its own (`GatehouseDemo`), because AppTrak's `fm` is Census's locally
  and `fm` serves one application (G-R9): FM2280's `fm` DDL, Gatehouse's features (unprefixed) and their grants.
  `FeatureAccess:ConnectionString` names it; in the live app it is wherever that app's `fm` lives.
- **Your Windows account as a member** with roles on `gatehouse`, in a **git-ignored** local seed
  (`.docs/local/`), so your account name stays out of the repo.
- **The demo logs** from `CensusLogsDemo`, through the connection string `logs` (Census's `Logs:ConnectionString`).

## 9. Slices

| Slice | Contents | Verified by |
|---|---|---|
| G-1 | Project, Windows sign-in, the claims transformation, the command/query core (async), `_Layout` + the sidebar partial from the nav declaration, Feature Management evaluation and the admin page on command/query, the gate test, Home. | Signed in as yourself: your roles shown; flipping a feature or a grant on the admin page shows or hides a nav item and turns its endpoint 200 ↔ 403 without a restart; the gate test fails on an ungated controller. |
| G-2 | Membership on command/query. | Census's membership tests ported; a grant made on the page shows on Home after the next sign-in. |
| G-2b | The visitor welcome and the request to join (§11): the form, the table, the requests on the Membership page, approve and decline. | Signed in as a non-member: the welcome, a request sent, a second refused; as an administrator: the request on the Membership page, approved into a member with the asked roles, who then sees Home. |
| G-3 | Logs: Log Explorer, Trace, Usage on command/query. | The counts against direct SQL as in Census's verification logs; the three pages in a browser. |
| G-4 | A porting note per component (`PORTING.md` in each folder): what to copy, the lines for `Program.cs`, the SQL to run, what the live app already has. | Read against the live app's shape: a dry run on paper with you. |

## 9a. G-1, built (2026-10-23)

| Folder / file | What |
|---|---|
| `Gatehouse.slnx`, `Gatehouse.Web/`, `Gatehouse.Tests/` | The app (.NET 8, port 5296) and its tests. Nothing references Census.Web |
| `command-query/` | xf-dashboard's contracts kept (`IJsonQueryHandler`, `IJsonCommandHandler`, `ISqlCommandInitializer`, `IInitializerLocator`, `CommandInitializer`, `IParameters`, `Response<T>`) and their implementations, with the corrections in xf-dashboard's open item 27: real async; rows kept on every path; a top-level `FOR JSON` read whole; `THROW 50400/50404/50409` and unique-key violations set 400/404/409. Scripts are embedded by path (`feature-management/sql/feature-list.sql`) |
| `identity/` | `ClaimsTransformer` (xf-dashboard's shape: split, a cached session per user for `Identity:SessionMinutes`, the auth provider on a miss, `ClaimTypes.Role` claims, the `Authorization:SystemAdministrators` list; no impersonation), `MembershipAuthProvider` + `sql/member-roles.sql` (the member by identifier, their member-types roles on `Identity:Application`) |
| `feature-management/` | FM2280 on command/query: `FeatureSqlCommandInitializer` and `sql/` (FM2280's scripts, each ending in a real `FOR JSON` so the handlers read them as JSON; the definitions as one array, not two result sets), `FeatureQueryHandler`/`FeatureCommandHandler` on the `fm` connection, the definition store, targeting, the gate scanner, `api/FeatureAccessController` (FM2280's routes and answers, so its page is reused as is), `Navigation.cs` (the one nav declaration and its filter), `views/FeatureAccess.cshtml` |
| `Views/Shared/_Layout.cshtml`, `_SidebarNavPartial.cshtml` | The sidebar, trimmed on the server from the declaration |
| `controllers/PagesController.cs` | Home (who you are, your roles, the features on for you), the Feature Access page, and gated placeholders for Log Explorer, Trace, Usage and Membership (their slices fill them) |
| `setup/Invoke-GatehouseDemo.ps1` | `GatehouseDemo` with FM2280's schema and Gatehouse's four features; the `gatehouse` application and you (`$env:USERNAME`, never in the repo) with `-Roles` on it, in the local AppTrak |

**Verified (2026-10-23):** `dotnet test Gatehouse.slnx` passes 19:
- **Unit:** every action carries a feature or a named policy; nothing allows anonymous users; every sidebar item names the
  gate of the page behind it; the admin API sits behind the fixed policy, never a feature; command keys, parameters,
  camel case, a key claimed twice, `DOMAIN\username`.
- **End to end against `GatehouseDemo`** (a test sign-in in place of Windows, a stub in place of membership):
  - a system-administrator sees every item and opens every page;
  - a technical lead sees the logs and gets 403 on Membership, Feature access and the admin API;
  - a member with no role sees Home only;
  - anonymous gets 401;
  - a feature switched off hides its item and refuses its page without a restart;
  - the admin API answers 400 for a bad name, 409 for a stale row version, 404 for no feature.

**Live on :5296 with real Windows sign-in**, as yourself:
- `DOMAIN\you` → your identifier → `system-administrator` from membership; every item, every page 200, the gate scan
  listing the four gates.
- `logs.usage` switched off through the API: Usage gone from the sidebar, `/usage` 403; on again: 200; the audit names you.
- Re-seeded as `technical-lead` (and restarted, past the session cache): the sidebar was Home and the three Logs pages,
  and Membership, Feature access and the admin API answered 403.

**Not seen:** IIS (the porting note covers it, G5); a grant change reaching a signed-in user within the five minutes
without a restart (the cache's expiry was not waited out).

## 9e. The package (2026-10-24)

Robert, 2026-10-24: "the live apps source IS NOT HERE. i am preparing a 'pachage of code' that i will be manually adding
to 'live' application on another network." So the deliverable is a package that stands alone:

- `Gatehouse.Web/setup/New-GatehousePackage.ps1` builds `out/gatehouse-package-<date>.zip` (git-ignored). Inside are the
  app, its tests, the solution, the docs the notes cite (this spec and Census's `log-explorer-and-trace.md`, `usage.md`,
  `go-live-log-explorer.md`), an index (`Gatehouse.Web/PORTING.md`, copied to the root) and `MANIFEST.sha256`. It
  leaves out build output, `appsettings.Local.json` and anything Copilot. It refuses to build if this machine's user,
  computer or domain name appears in any file.
- `Test-GatehousePackage.ps1` (at the package's root) checks the copy against the manifest: missing, changed, extra.
- Each component is self-contained: its page controllers moved from `controllers/PagesController.cs` into the
  component's folder (`feature-management/FeatureAccessPageController.cs`, `membership/MembershipPageControllers.cs`,
  `logs/LogsPageController.cs`). The notes cite only files inside the package.

**Verified (2026-10-24):**
- The zip, unpacked into an empty folder, checks clean (158 files). Built there, `dotnet test` passes 29.
- The check catches a changed script, a removed doc and a stray file (exit 1).

**Open:** the live log tables' body columns (Robert, 2026-10-24: live has `BodyType` and `Body`, where the demo has
`ContentType` and `Content`). Two scripts read them (`logs/sql/search.sql`, `logs/sql/trace-session.sql`); they change
once the live shape is confirmed (§10, G8).

## 9d. G-4, the porting notes (2026-10-24)

One `PORTING.md` per folder, in the order to port them. Each says what the live app already has, what to copy, the
`Program.cs` lines, the settings, the SQL to run, and how to check it worked.

| Order | Note | The one thing to read first |
|---|---|---|
| 1 | `command-query/PORTING.md` | The live handlers may lack four things the components need (real async, rows kept, long `FOR JSON` read whole, THROW → 400/404/409). Recommended: port Gatehouse's handlers **beside** the live ones and hand them to the components only, so nothing that runs today changes |
| 2 | `identity/PORTING.md` | Add the `identifier` and `member` claims to the live transformation; don't replace it. Where the roles come from is G7: membership's (A) or the live app's own (B) |
| 3 | `feature-management/PORTING.md` | `fm` serves one application; the sidebar as one declaration; port the gate test, and expect it to name the live app's ungated actions at first |
| 4 | `membership/PORTING.md` | Two new tables in AppTrak (`MembershipAudit`, `MembershipRequest`); the live app's own `membership.Application` row; the eight colour tokens `membership.css` borrows |
| 5 | `logs/PORTING.md` | The `logs` connection points at AppTrak; the log indexes per Census's go-live; the long-session check proves the handler |

**Verified:** every file, setting, registration and path a note names exists in Gatehouse as named (checked by listing,
2026-10-24). Not verified: anything about the live app beyond what xf-dashboard shows (read only), which is why the slice
ends in a dry run on paper with you.

## 9c. G-3, built (2026-10-24)

| Folder / file | What |
|---|---|
| `logs/sql/` | Census's `apptrak/sql/logs` scripts, unchanged, but without `usage-summary.sql`, which only Census's personas period view reads. Each JSON script answers `SELECT (… FOR JSON …) AS JsonNode`, which the handler reads whole; the others answer rows |
| `logs/sql/ddl/001-log-indexes.sql` | Census's key-only log indexes, for the porting note (Census's go-live doc covers running them) |
| `logs/LogsOptions.cs` | `Logs:Schema` (default `apptrak`), `Logs:SlowMs`, and Usage's `FiscalYearStartMonth` (default 10, Census's `Personas` setting) and friction thresholds |
| `logs/data/LogsSqlCommandInitializer.cs` | Keys `gatehouse.logs.*`, each naming the parameters its script takes. The schema, the slow threshold and the friction thresholds come from settings, never the request |
| `logs/api/LogsControllers.cs` | `LogsQueryHandler` on the `logs` connection; Census's three APIs (`/api/logs`, `/api/trace`, `/api/usage`) with their routes, checks and answers, each behind its page's feature |
| `logs/views/`, `controllers/PagesController.cs` | `/logs`, `/trace`, `/usage` in Gatehouse's layout, full width. Each page is told which of the other two its reader may open |
| `wwwroot/js/logs`, `trace`, `usage`, `wwwroot/css/logs.css`, `trace.css`, `usage.css` | Census's modules and styles. Changed: Usage imports its own copy of `period.mjs`, and Trace's and Usage's cross-links (Trace to Usage and to Log Explorer, Usage to Trace) are plain text when the reader's feature for the other page is off |

**Verified (2026-10-24):**
- **Against Census, answer for answer:** Census on :5292 and Gatehouse on :5296, both on `CensusLogsDemo`, asked the same
  27 questions:
  - Log Explorer: facets, search (plain, filtered, refused, sorted, exceptions, messages);
  - Trace: people, month, day, session;
  - Usage: applications and every section, a page's detail;
  - empty windows;
  - the refusals: a bad window, a window too long, an unknown model, an unknown section, an unknown column.
  Every answer was identical, status code and JSON. Search's total for 1–24 October (4,099) equals a direct
  `COUNT(*)`.
- **Tests:** `dotnet test Gatehouse.slnx` passes 29. A devops lead opens Log Explorer and Trace but gets 403 from
  Usage's page and API; an observer gets 403 from all three APIs. Trace's page tells a devops lead that Usage is
  closed and a technical lead that it is open, and Usage's tells an application owner that Trace is closed. The reads
  answer in Census's shapes.
- **Node:** Census's Trace, Usage and period tests, run against Gatehouse's copies, pass 14, 33 and 25.
- **In a browser** (headless Edge, real Windows sign-in, as yourself): Log Explorer on a session's day (its 36 requests,
  the facets), Trace (cdiaz's October, 22 October, one session's timeline), Usage (WidgetCore, PROD, October: overview,
  pages, paths), each in the sidebar layout.

**Not seen:** the live log tables (the porting note covers the `logs` connection pointing at AppTrak); a page with its
cross-link turned to text in a browser (the test checks what the page is told); Usage's period picker across a fiscal
year boundary in Gatehouse.

## 9b. G-2, built (2026-10-24)

| Folder / file | What |
|---|---|
| `membership/sql/` | Census's `apptrak/sql/membership` scripts (not `applications.sql`, which only Census's personas read). Changed: every write ends in `SELECT … AS [key] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER`, so the command handler reads the key back; `application-delete.sql` counts Move It's and the health pings' rows only where those tables exist (`OBJECT_ID`), since they are Census's |
| `membership/sql/ddl/001-membership-audit.sql` | `membership.MembershipAudit`, as Census's (idempotent). The live AppTrak needs it if Census's go-live has not made it |
| `membership/data/` | `MembershipSqlCommandInitializer` (keys `gatehouse.membership.*`), `MembershipRequests` (Census's checks, every reason at once, in the page's words) |
| `membership/api/MembershipController.cs` | Census's routes and answers (`{ key }`, `{ errors: [...] }`), behind `admin.membership`, the page's own feature (§6). The actor is the signed-in identifier |
| `membership/views/Membership.cshtml`, `controllers/PagesController.cs` | `/admin/membership`, told which application is this one (`Identity:Application`) |
| `wwwroot/js/membership/` | Census's page, model and API modules, with their two helpers copied beside them (`utils/format.mjs`, `components/record-form.mjs`). Rows are camel-cased, as the handlers send them; the audit's before/after keep the tables' names. Census's estate rule is gone: the landing page asks whether *this* application is registered and has a system-administrator |
| `wwwroot/css/membership.css` | The rules of Census's `personas.css` the page uses, on Gatehouse's colours, scoped to the page |
| `command-query/JsonHandlers.cs` | A foreign-key refusal (547) answers 409 with a plain sentence, so deleting a row the live AppTrak still refers to is refused, not a 500 |
| `setup/Invoke-GatehouseDemo.ps1` | Also makes `membership.MembershipAudit` in the local AppTrak |

**Verified (2026-10-24):** `dotnet test Gatehouse.slnx` passes 22; `node Gatehouse.Tests/js/membership-model.test.mjs` passes 16.
- **Census's `Test-Membership.ps1`, ported** (`MembershipEndToEndTests`, against the local AppTrak, its rows `gt-test-*` deleted
  before and after):
  - create, edit and delete an application and a member;
  - 409 for a taken identifier or Windows identity, 400 for settings that are not JSON, every reason at once for an empty
    form, 400 for a body of the wrong shape, 404 for an edit of nothing;
  - grant and revoke, 409 for either twice, 404 for a role not in member-types;
  - the identity lookup (the real `MembershipAuthProvider`) sees a grant the moment it is made and loses it on revoke;
  - the history newest first, by the signed-in identifier, an update keeping both sides;
  - an application's roles, stages and services added, corrected and removed;
  - a deleted member's and application's history keeping what hung off them;
  - deleting an application Move It still names: 409, saying "release".
- **Census's `Test-Membership.mjs`, ported:** the members folded, the gaps (this application unregistered or with no
  system-administrator, a member with no role, an application with nobody or no owner), the audit in words.
- **The gate:** a technical lead gets 403 from the page and the API; the gate test covers the new controller.
- **Live on :5296 with real Windows sign-in** (Chrome, `Identity:SessionMinutes` = 1): as yourself, on your member page,
  granted devops-lead on Gatehouse. The page said Granted and its history named you. Home still showed
  system-administrator alone (inside the session); a minute later, with no restart, Home showed devops-lead and
  system-administrator. Revoked it on the page; the overview's recent changes lead with the revoke.

**Not seen:** a refusal by a foreign key (547) from a live table; the local AppTrak has none that fires. Phone width:
Gatehouse's sidebar is a fixed 15rem column (G-1), so the page is cramped there.

## 10. Open items

| # | Question | Recommendation | Needed |
|---|---|---|---|
| G1 | ~~Name and port~~ **Ruled: Gatehouse, 5296** (G-R8). | — | — |
| G2 | ~~Feature names in a shared `fm`~~ **Ruled: `fm` serves one application** (G-R9). | — | — |
| G3 | **Result shape by sniffing the SQL text** (§4). | Keep it, to match the live app; it is a known sharp edge, and each initializer's script is short enough to check by eye. | His word. |
| G4 | ~~FM2280's data layer onto command/query~~ **Ruled: yes** (G-R10). | — | — |
| G5 | **Windows sign-in on Kestrel** locally (Negotiate) against IIS in the live app. | Written into `identity/PORTING.md`: the same `AddNegotiate()` code; hosted in IIS it defers to IIS's Windows authentication (on), anonymous off. | Your check of the live site's IIS settings. |
| G6 | ~~The live app's claims transformation~~ **Answered: essentially xf-dashboard's** (G-R11). | — | — |
| G7 | **Where do the live app's roles come from today?** (`identity/PORTING.md` sets out A and B.) xf-dashboard's auth provider reads its own person and role tables. If the live app's does too, its roles and membership's `member-types` are two vocabularies, and features must be granted to the one its claims carry. | The porting note for identity shows both: the auth provider reading membership (Gatehouse's), or features granted to the app's existing roles with no change to its provider. You pick when porting. | His look at the live app's provider. |
| G8 | **The live body columns.** The demo keeps a request's body in `apptrak.ApiContent` (`Uid`, `ContentType`, `Content`; `ContentType = 0` is the request body), flagged by `apptrak.ApiRequest.HasContent`. Live has `BodyType` and `Body`. | Make the two scripts match live, so you never hand-edit T-SQL there; keep the local demo working by matching the demo's DDL to live. | The live columns of `apptrak.ApiRequest` and `apptrak.ApiContent` (names only). |

## 11. The visitor welcome and the request to join (G-2b; built 2026-10-24)

The ask (Robert, 2026-10-24): "a Visitor welcome view that allows the user to REQUEST to join. it should capture their
identifier (windows DOMAIN\USERNAME), and a brief description of why they want to join, their application[] name(s) and
their role (Product Owner, etc); this is what should show up if they currently are not a member."

### 11.1 Who sees it

- **Signed in by Windows, and no `membership.Member` row with that identifier** (`UserSession.IsMember` false). Home sends
  them to `/welcome`; the sidebar shows Welcome alone. Every other page refuses them, as today.
- **A member with no role here** sees Home as today, not the welcome: they are already known, and the Membership page is
  where their roles are given (V5).
- **No impersonation** (G-R2): the request is always for the signed-in Windows user.

### 11.2 The form

| Field | Source | Rule |
|---|---|---|
| Windows identity | `User.Identity.Name` (`DOMAIN\USERNAME`), shown, never typed | The server writes it; a body that names another is ignored. The identifier is its `USERNAME` part (G-R3) |
| First name, last name, email | Typed | Needed because `membership.Member` requires them (all `NOT NULL`), so approving needs no typing (V2) |
| Why you want to join | Typed, required, up to 1,000 characters | |
| Application(s) | One or more from `membership.Application` (not retired) | At least one (V3) |
| Role | One from `member-types` (Product Owner, Technical Lead, …), shown by its display name | Asked once, for every application chosen (V4) |

After sending, the page says the request is waiting and shows what was sent; a second request while one waits is refused
(409), saying so. A declined request shows its reason, and the visitor may ask again.

### 11.3 The table (new DDL in AppTrak's `membership`, V1 ratified 2026-10-24: `membership/sql/ddl/002-membership-request.sql`)

```sql
CREATE TABLE membership.MembershipRequest (
    MembershipRequestId int IDENTITY(1,1) NOT NULL CONSTRAINT PK_MembershipRequest PRIMARY KEY,
    Identifier      nvarchar(100)  NOT NULL,   -- USERNAME, as membership.Member.Identifier
    WindowsIdentity nvarchar(72)   NOT NULL,   -- DOMAIN\USERNAME, as signed in
    FirstName       nvarchar(100)  NOT NULL,
    LastName        nvarchar(100)  NOT NULL,
    Email           nvarchar(100)  NOT NULL,
    Reason          nvarchar(1000) NOT NULL,
    RoleId          int            NOT NULL,   -- core.SelectItem, member-types
    ApplicationIds  nvarchar(max)  NOT NULL,   -- JSON array of membership.Application Ids
    Status          varchar(20)    NOT NULL,   -- pending | approved | declined
    RequestedAt     datetimeoffset NOT NULL CONSTRAINT DF_MembershipRequest_RequestedAt DEFAULT (SYSDATETIMEOFFSET()),
    DecidedBy       nvarchar(100)  NULL,
    DecidedAt       datetimeoffset NULL,
    DecisionNote    nvarchar(1000) NULL
);
CREATE UNIQUE INDEX UX_MembershipRequest_Pending ON membership.MembershipRequest (Identifier) WHERE Status = 'pending';
```

- **One pending request per identifier**, held by the filtered unique index as well as the script's `THROW 50409`.
- **The applications as a JSON array**, not a child table: a request is read and decided whole, never queried by
  application, and the approval turns it into `MemberApplicationRole` rows, which are the relational record.
- **Kept, never deleted:** a decided request is the record of who asked for what and who said yes. Each write also leaves
  a `MembershipAudit` row (entity `request`), as every Membership write does.

### 11.4 The administrator's half (on the Membership page, `admin.membership`)

- **"Needs a word" leads with the waiting requests**, and a Requests tab lists them: who, why, which applications,
  which role, when.
- **Approve** (one script, one transaction): create the member from the request (or refuse with 409 if a member with that
  identifier or Windows identity now exists), grant the role on each application, mark the request approved, audit all
  of it. The approver may change the role or drop an application before approving.
- **Decline** with a note, which the visitor sees.
- The new member's roles reach them within `Identity:SessionMinutes`, as any grant does.

### 11.5 Gates (both halves, §6)

- `/welcome` and its API (`GET` the visitor's own request, `POST` a request) behind a **fixed policy `Visitor`**: signed
  in and not a member. Not a feature: switching it off would leave a non-member with a blank page and no way in.
- Listing, approving and declining requests: `admin.membership`, as the rest of the Membership API.
- The gate test already fails on an ungated action; the end-to-end tests add: a member gets 403 from `/welcome`, a
  visitor gets 403 from every other page, a visitor cannot name another identity.

### 11.6 Open items

| # | Question | Recommendation | Needed |
|---|---|---|---|
| V1 | ~~The new table~~ **Ratified 2026-10-24** ("V1, new table"), as drafted. | — | — |
| V2 | **Ask for first name, last name and email?** Not in your list, but `membership.Member` requires all three. | Built so (calls-made-for-you, 2026-10-24); say if you would rather the approver types them. | — |
| V3 | **Applications not in the registry?** | Pick-list only; one not listed goes in the reason, and the approver registers it first. | — |
| V4 | **One role for all the applications, or one per application?** You said "their role". | One, as you said; the approver can adjust per application at approval. | — |
| V5 | **A member with no role here: welcome too?** | No (§11.1): they are known; their roles are given on the Membership page. | Your word if you want otherwise. |
| V6 | **Telling administrators a request is waiting** (email, a count in the sidebar). | A count beside Membership in the sidebar, for those who can open it; no email (Gatehouse sends none). | — |

### 11.7 Built (2026-10-24)

| Where | What |
|---|---|
| `membership/sql/ddl/002-membership-request.sql` | The table of §11.3, idempotent; `setup/Invoke-GatehouseDemo.ps1` runs it |
| `membership/sql/welcome-choices.sql`, `welcome-mine.sql`, `request-create.sql` | What a visitor may pick (applications not retired, member-types by display name, nothing more), their latest request, and the request itself (refused for a member, a second waiting request, or a choice not on offer) |
| `membership/sql/admin-requests.sql`, `request-decide.sql`, `requests-pending-count.sql` | The requests for the Membership page; approve (member, grants, request, all audited, in one transaction) or decline with a note; the sidebar's count |
| `identity/ClaimsTransformer.cs` | A `member` claim, `true` or `false` |
| `feature-management/` | The fixed `Visitor` policy (signed in, `member` = `false`); the sidebar shows a visitor the Welcome item alone, and a count beside Membership when requests wait |
| `membership/api/WelcomeController.cs`, `/welcome` (`controllers/PagesController.cs`, `membership/views/Welcome.cshtml`) | The visitor's API and page, behind `Visitor`. Home sends a visitor there |
| `membership/api/MembershipController.cs` | `GET requests`, `POST requests/{id}/approve`, `POST requests/{id}/decline`, behind `admin.membership` |
| `wwwroot/js/membership/welcome-page.mjs`, `membership-page.mjs` | The welcome (form, waiting, approved, declined with its reason); the Membership page's Requests tab, and "Needs a word" leading with waiting requests |

**Verified (2026-10-24):** `dotnet test Gatehouse.slnx` passes 26; the node model test 18.
- **End to end (`WelcomeEndToEndTests`, local AppTrak):** a visitor is sent from `/` to the welcome, sees Welcome alone in
  the sidebar, and gets 403 from the Logs, Membership and Feature access pages and APIs; a member gets 403 from the
  welcome and its API. A request with every field empty is refused with every reason; an application not on offer, 400.
  A body naming another Windows identity is ignored: the request is the signed-in user's. A second request while one
  waits: 409. The administrator sees it and the sidebar count; approval with no application, 400; approved with a
  changed role and an application dropped, it makes the member with that role on the kept application only (the real
  identity lookup), audits it, and a second approval is 409. Declining needs a note; the visitor sees it and may ask
  again.
- **Live on :5296 with real Windows sign-in**, your local member row removed for the run (local demo data):
  - signed in as a visitor, `/` went to the welcome, with Welcome alone in the sidebar; filled the form in Chrome
    (Gatehouse and WidgetCore, Product Owner); it said Sent and showed the request waiting;
  - the Requests tab showed it; approved it as system-administrator on Gatehouse only, WidgetCore unticked; the
    database held the new member with that one grant, the request approved, your note;
  - restarted with nothing but membership: Home showed system-administrator and every sidebar item; `/welcome` was 403.
  - To approve your own request I ran that first part with you in `Authorization:SystemAdministrators` (a run-time
    setting, not a file). Afterwards your member row's names were set back to the seed's.

**Not seen:** the sidebar count live (no request was waiting when the admin's page was shot; the end-to-end test checks
it); the approved-state welcome in a browser (the test checks its status).

**Noted:** a person in `Authorization:SystemAdministrators` who is not a member is both a visitor (the welcome, the
Welcome-only sidebar) and a system administrator (every page opens if they type its address). That list is the way in
for the first administrator, so it is left so.

## 12. AppEvent in Gatehouse (spec 2026-10-24)

Robert, 2026-10-24: "i want to have a fully implemented AppEvent and Usage in Gatehouse." AppEvent's design is Census's
`docs/app-event.md` (D1–D11); this section is how Gatehouse builds it, with his rulings of the same day.

### 12.1 Rulings (Robert, 2026-10-24)

| # | Ruling | Consequence |
|---|---|---|
| AE-R1 | **The lifecycle words, kebab-case** (E1): `created`, `handed-off`, `received`, `started`, `completed`, `failed`. | `CommandActivity` holds only these; anything else is refused at ingest with the list. |
| AE-R2 | **Nothing writes AppEvent today** (E2). | The columns of D2/D3/D6/D7 are added, and the indexes with them. |
| AE-R3 | **The catalog of kinds is generic, "completely different from xf-dashboard"; NOUN-VERB names; it must have a management screen** (E5). | §12.3. |
| AE-R4 | **The senders' sign-in is the live app's home-grown JWT, already active; not a concern now.** | Gatehouse's ingest sits behind a named policy on Windows sign-in; the porting note swaps the scheme. |
| AE-R5 | **The mainframe can make web calls, and drop files where a C# file-system watcher can see them** (E3). | Two ways in, one validation: the API and a drop folder (§12.4). |
| AE-R6 | **Who sees what is undetermined, but system administrators see every record; dashboards for executives, application owners and others come later.** | The pages are for system administrators now (§12.6); no dashboards in this slice. |
| AE-R7 | **"don't worry about outside apps calling, that's already solved in 'live'. just deal with the Ilogger"** (2026-10-24, overriding AE-R4/AE-R5 for Gatehouse). | No ingest API and no drop folder in Gatehouse. AppEvent arrives only through `ILogger` (§12.4). |

### 12.2 The table (`apptrak.AppEvent`, the `logs` connection)

The existing shape (Id, Uid, Identifier, Path, SessionId, CorrelationId, Machine, Stage, Application, StartAt, Namespace,
CommandName, CommandActivity, Body, Data, CreatedAt, IsFromApi, ExecuteOn/ExecuteAt computed), plus the nullable columns
`WorkUid nvarchar(36)`, `ParentUid nvarchar(36)`, `SubjectType nvarchar(50)`, `SubjectKey nvarchar(100)`, `Message
nvarchar(500)`, and the indexes of `docs/app-event.md` §6.

- **The unique index on `Uid` skips empty ones** (`WHERE Uid <> N''`). The live sink rebuilds the envelope when it writes,
  which empties the Uid (`ToAppEvent`, read 2026-10-24); a plain unique index would make every second event of such a
  sink fail, silently. The sink's fix is in the porting note; until it is ported, nothing calls it (AE-R2).
- `logs/sql/ddl/002-app-event.sql` creates the table where it is missing (the local demo has none) and adds what is
  missing where it exists (the real one). Idempotent.

### 12.3 The catalog of kinds (AE-R3)

A kind is **`Namespace` + `CommandName`**: the business area (`underwriting`) and a **NOUN-VERB** name (`quote-request`,
`policy-renew`), both kebab-case. Gatehouse checks the form (kebab-case; the command at least two words); whether the
first word is a noun is the registrant's to judge.

- **`membership.AppEventKind`** in AppTrak, beside the application registry: `AppEventKindId`, `Namespace`,
  `CommandName`, `DisplayName`, `Description`, `ApplicationId` (the owning application, `membership.Application`),
  `Disposition` (`current` | `retired`), `CreatedAt`, `CreatedBy`; unique on (Namespace, CommandName). Every write
  audited in `membership.MembershipAudit` (entity `app-event-kind`), as Membership's are.
- **Unregistered kinds are stored and flagged, never dropped** (D5). The flag is worked out when read, not written: the
  catalog lives in AppTrak and the events in the `logs` database, which are different databases locally.
- **The management screen** (`/admin/app-event-kinds`): the registered kinds with their events in the last 30 days; the
  kinds **seen in events but not registered**, each with Register (observe, then declare: never guessed from the name);
  add, correct, retire; the history.

### 12.4 Through ILogger (AE-R7)

**`logger.LogActivity(…)`**, an `ILogger` extension, with no Serilog in the caller. It logs xf-dashboard's
`[appevent:` template (`SerilogMessageTemplates.AppEventFormat`) with the event serialized as its `appevent` property,
so the live Serilog sink, which already routes that template to AppEvent, carries it. The caller names the kind (Namespace,
NOUN-VERB CommandName), the step (AE-R1), the plain words, and optionally the unit of work, the parent event, the
subject, the business payload. The extension fills the event's own Uid and the moment it happened; the sink adds the
envelope (application, stage, identifier, session, correlation, machine).

- **The extension refuses a malformed event before it is logged**: an activity outside AE-R1, or a kind not in
  kebab-case NOUN-VERB form, throws `ArgumentException` at the caller, in development and in production alike. A
  wrongly named event is a programming error, and the log is no place to discover it.
- **In Gatehouse, a logger provider stands in for the live sink**: it recognizes the template, adds the same envelope
  (application and stage from settings, identifier and session from the request), and writes through one
  command/query script to `<Logs:Schema>.AppEvent`. It writes on a background queue, so a request never waits on it, and
  it logs and drops what it cannot write: AppEvent is not the audit of record (D11).
- **The live sink needs four fixes**, and the porting note lists them. It must write to the schema the pages read (it
  says `[log]`, Gatehouse `Logs:Schema`); keep the event's own StartAt and Uid instead of overwriting them; take the
  envelope from the log context instead of a fresh `LogInfo`; and write the five new columns.

**Gatehouse uses it itself**, so the path runs for real: the request to join is a unit of work (kind `membership` /
`access-request`). Asking logs `created`; approving logs `completed`; declining logs `failed`. All three carry the
request's WorkUid, and the subject is the request.

### 12.5 The demo events

Manufactured (no real data): a week of units of work across three systems: a portal, a service and a mainframe job.
Each has its hand-offs, waits and failures, and some work is stuck. There is one kind nobody registered, and there are
late and duplicate arrivals. They load into the local `CensusLogsDemo` (`logs/sql/seed/seed-app-events-demo.sql`,
run by `setup/Invoke-GatehouseDemo.ps1`).

### 12.6 What system administrators see (AE-R6)

- **Log Explorer gains an AppEvent model**, beside ApiRequest, Exception and Message: its facets (application, stage,
  namespace, command, activity, subject type, identifier) and rows, from the same scripts. The table is added to their
  checked list. The model is offered, and answered, only with the feature `logs.app-events` (granted to
  system-administrator); the tab is hidden without it.
- **One unit of work** (`/app-events/work/{workUid}`, same feature): its events in order across systems, as a tree by
  ParentUid. Each step shows when it happened, by which application, and how long since the step before, named as
  **waiting** (handed-off → received) or **working** (started → completed). The page also shows the total, the arrival
  lag, and whether the kind is registered. From Log Explorer, a row's WorkUid opens it.
- **The kinds** (`/admin/app-event-kinds`, feature `admin.app-event-kinds`, system-administrator).
- Dashboards (durations, throughput, stuck work for executives and owners) wait for AE-R6's later decision; the indexes
  that serve them go in now.

### 12.7 Slices

| Slice | Contents | Verified by |
|---|---|---|
| A-1 | The table's DDL, the catalog table and its management screen, the demo events | The DDL twice (idempotent) on the demo and on a copy of AppTrak's empty shape; the screen in a browser: register a seen kind, correct, retire, history |
| A-2 | `LogActivity`, the provider that stands in for the live sink, Gatehouse's own access-request events | Tests: a malformed event refused at the caller; an activity written with its envelope, kind, unit of work and subject; a request to join, approved, read back as one unit of work (created, completed) |
| A-3 | Log Explorer's AppEvent model and the unit-of-work page | Counts against direct SQL; the page for a demo unit of work with waiting and working times; 403 without the feature |

## 13. Usage, completed in Gatehouse (spec 2026-10-24)

Robert, 2026-10-24, on Census's open items: 7 "exactly", 8 "yes, and for sys admins", 9 "yes", 10 "later we'll deal
with usability", 11 "yes".

| # | Ruling | Gatehouse |
|---|---|---|
| U-R1 | **A person sees only the applications they hold a role on; system administrators see all** (U2, his 7). | The server decides: Usage's API answers 403 for an application outside the reader's scope, and the applications list is trimmed. A registry application matches the log rows whose Application is its name or identifier, ignoring case; a held application with no rows under either is named at the foot of the page (U9, never guessed). |
| U-R2 | **An all-applications summary, for executives and system administrators** (U5, his 8). | `/usage/summary`, feature `logs.usage-summary` (executive, system-administrator): every application's people, sessions and sessions ending on an error, this period against the last; each row opens that application's Usage when the reader may. Census's `usage-summary.sql`. |
| U-R3 | **Staff and test identifiers left out of the figures** (U7, his 9). | `Usage:Excluded`: identifiers for every application (`"*"`) or per application. Every Usage script leaves them out, and every page says who is left out. |
| U-R4 | **Friendly page names: later** (U4, his 10). | Not built. |
| U-R5 | **Visits that arrive from another application** (U6, his 11). | Pages gains "came from": for the pages a session entered on, the other applications whose pages linked there. An application's address is the `Host` its own requests recorded (observed, not named); a referer on another application's host is a visit from it. |

| Slice | Contents | Verified by |
|---|---|---|
| U-a | Scope (U-R1) | A product owner of one application sees it alone and gets 403 for another; a system administrator sees all; an unmatched held application is named |
| U-b | The summary (U-R2) | Against direct SQL; 403 for a technical lead |
| U-c | Exclusions (U-R3) | With the list empty, every Usage answer is unchanged from G-3's diff against Census; with it set, the excluded identifiers' counts are gone and the page names them |
| U-d | Came from (U-R5) | A demo session entering from another application's page shows it |
