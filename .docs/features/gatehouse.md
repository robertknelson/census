# Gatehouse — a reference app for porting Feature Management, Membership and Logs

Status: **G-1 built 2026-10-23** (the shell: Windows sign-in, the claims transformation, command/query, the sidebar, Feature Management and its gates). G-2 (Membership), G-3 (Logs) and G-4 (porting notes) to come.

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
- **The demo logs** from `CensusLogsDemo`, through `Logs:ConnectionString`, as Census does.

## 9. Slices

| Slice | Contents | Verified by |
|---|---|---|
| G-1 | Project, Windows sign-in, the claims transformation, the command/query core (async), `_Layout` + the sidebar partial from the nav declaration, Feature Management evaluation and the admin page on command/query, the gate test, Home. | Signed in as yourself: your roles shown; flipping a feature or a grant on the admin page shows or hides a nav item and turns its endpoint 200 ↔ 403 without a restart; the gate test fails on an ungated controller. |
| G-2 | Membership on command/query. | Census's membership tests ported; a grant made on the page shows on Home after the next sign-in. |
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

## 10. Open items

| # | Question | Recommendation | Needed |
|---|---|---|---|
| G1 | ~~Name and port~~ **Ruled: Gatehouse, 5296** (G-R8). | — | — |
| G2 | ~~Feature names in a shared `fm`~~ **Ruled: `fm` serves one application** (G-R9). | — | — |
| G3 | **Result shape by sniffing the SQL text** (§4). | Keep it, to match the live app; it is a known sharp edge, and each initializer's script is short enough to check by eye. | His word. |
| G4 | ~~FM2280's data layer onto command/query~~ **Ruled: yes** (G-R10). | — | — |
| G5 | **Windows sign-in on Kestrel** locally (Negotiate) against IIS in the live app. | Kestrel with Negotiate for local runs; the porting note covers IIS (Windows authentication on, anonymous off). | — |
| G6 | ~~The live app's claims transformation~~ **Answered: essentially xf-dashboard's** (G-R11). | — | — |
| G7 | **Where do the live app's roles come from today?** xf-dashboard's auth provider reads its own person and role tables. If the live app's does too, its roles and membership's `member-types` are two vocabularies, and features must be granted to the one its claims carry. | The porting note for identity shows both: the auth provider reading membership (Gatehouse's), or features granted to the app's existing roles with no change to its provider. You pick when porting. | His look at the live app's provider. |
