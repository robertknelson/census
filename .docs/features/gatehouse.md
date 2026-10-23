# Gatehouse — a reference app for porting Feature Management, Membership and Logs

Status: **spec, 2026-10-23, not built.** For Robert's ruling on the open items (§10) before any code.

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

## 3. Shape

- **`Gatehouse.Web/`**, an ASP.NET 8 MVC project beside `Census.Web/`, port **5296** (no other project's dispatch
  names it; Census is 5292). It references nothing in Census.Web: what you see is what you port.
- **`_Layout.cshtml` + `_SidebarNavPartial.cshtml`**, server-rendered, as in the live app.
- **One component per folder**, each with its C#, `.sql` (embedded resources), views, `.mjs` and CSS together:

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
- **The claims transformation** finds `membership.Member` by `Identifier = username` and adds one role claim
  (`identity.RoleClaimType`) per `member-types` identifier the member holds on **this application**: their
  `MemberApplicationRole` rows for the `membership.Application` whose identifier is the setting
  `Membership:Application`. Census's rule that a role on Census counts estate-wide stays in Census.
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
| Logs → Log Explorer | Census's `/logs` | `gatehouse.logs.explorer` |
| Logs → Trace | Census's `/trace` | `gatehouse.logs.trace` |
| Logs → Usage | Census's `/usage`, every application in the logs (no persona scoping) | `gatehouse.logs.usage` |
| Administer → Membership | Census's membership page | `gatehouse.admin.membership` |
| Administer → Feature access | FM2280's page | fixed policy (§6) |

## 8. Local runs

- **Your local AppTrak**, with Census's demo seeds (`apptrak/Invoke-AppTrakDemo.ps1`) plus a Gatehouse seed: the
  `gatehouse` application in `membership.Application`, its features in `fm`, and their grants.
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

## 10. Open items

| # | Question | Recommendation | Needed |
|---|---|---|---|
| G1 | **Name and port**: Gatehouse, 5296? | Gatehouse: it decides who gets in, knows who they are, and keeps the log of who came. | His word. |
| G2 | **Feature names in a shared `fm`.** `fm` has no application column, so Census's features and Gatehouse's sit in one list, and each app's admin page shows the other's. | Prefix by application (`gatehouse.*`). In the live app, its own prefix. An application column in `fm` would be the proper fix, a change to FM2280 for later. | His word; whether the live app's `fm` is shared. |
| G3 | **Result shape by sniffing the SQL text** (§4). | Keep it, to match the live app; it is a known sharp edge, and each initializer's script is short enough to check by eye. | His word. |
| G4 | **FM2280's data layer moves onto command/query** in Gatehouse (FM2280 itself uses per-domain handlers). | Yes: the live app is command/query, so the port should be too. FM2280 stays as it is. | His word. |
| G5 | **Windows sign-in on Kestrel** locally (Negotiate) against IIS in the live app. | Kestrel with Negotiate for local runs; the porting note covers IIS (Windows authentication on, anonymous off). | — |
| G6 | **Does the live app's existing claims transformation add roles from somewhere else** (AD groups, an app role table)? | If it does, the features target membership roles while the app checks its own: both kept for a while, then the old checks moved to features one at a time (your gradual-migration rule). | His answer. |
