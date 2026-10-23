# Log Explorer and Trace — reading the shared `log` tables

Status: **Log Explorer built 2026-10-23 (L-1, L-2, its nav item); Trace (T-1..T-3) not built.** Go-live: `.docs/go-live-log-explorer.md`. Brought over from xf-dashboard
(`C:\github\repos\xf-dashboard`: `.docs/features/log-explorer.md`, `.docs/features/support-tooling.md`
S2, S2b, S3, S7), UX and readers only.

## 1. The ask (Robert, 2026-10-23)

"Some functionality in xf-dashboard that i want brought into this project. it is the LogExplorer along
with Trace … the UX portion of it, reading the tables, and showing sessions, day, calendar, etc."

## 2. Rulings (Robert, 2026-10-23)

| # | Ruling | Consequence |
|---|---|---|
| R1 | **No new tables.** The target's log tables are the same shape as xf-dashboard's DDL. | Census reads `ApiRequest`, `ApiContent`, `Exception`, `Message`, `Session` as they are. Nothing is written to them. |
| R7 | **In the real AppTrak database, schema `apptrak`** (Robert, 2026-10-23: "in live, it is a databaes named AppTrak, and the schema is [apptrak]"), not xf-dashboard's `log`. | `Logs:Schema`, default `apptrak`; the readers check the table exists under it. The demo database uses `apptrak` too. The index script's `@schema` is `apptrak`. No `Logs:ConnectionString` needed live: AppTrak is Move It's connection. |
| R2 | **Identifier is the person's key**; who they are is not needed. | No people table, no names beside logins, no former-login resolution (xf-dashboard S7 rules 1–2 dropped). The picker offers identifiers. |
| R3 | **"What they did" keeps the concept, not the port**: the target's ActivityEvents differ. | A provider seam (§6); the real provider is for later (open item T3). |
| R4 | **Index scripts are included**: "i'm certain those don't exist". | `apptrak/sql/logs/001-log-indexes.sql` (§7), run on the real log database before use. |
| R5 | **No gates.** "I am the only user for the system, and i use it for troubleshooting." | No `[FeatureGate]`, no server refusal, no sys-admin lock (xf-dashboard S2 rule 1 dropped). Request bodies show to whoever reaches the page. |
| R6 | **Sys Admin persona, behind features in `fm`** (agreed). | `view.log-explorer`, `view.trace`, granted to `system-administrator`; the features trim the nav only (R5). Built as link-outs in a **Troubleshoot** group: the pages are full width at `/logs` and `/trace`, and reachable before the personas go-live. |

## 3. What comes over

| xf-dashboard | Census | Change |
|---|---|---|
| `pages/system/log-explorer-page.mjs`, `components/log-explorer/*` | `wwwroot/js/logs/` | Application and Stage facets matter now (many apps in one table); names column dropped (R2). |
| `pages/system/trace-page.mjs`, `components/trace/trace-model.mjs` | `wwwroot/js/trace/` | Person = identifier; "What they did" from the provider (§6). |
| `feature-access/toast-stack.mjs`, `utils/dom.mjs`, `utils/time.mjs` | the Census equivalents where they exist, else copied | — |
| `_log-explorer.scss`, `_trace.scss` | `wwwroot/css/` on Census's tokens | Plain CSS, Census's theme. |
| `LogExplorerController`, data providers, `LogParameterExtensions`, `LogFacetDataProvider` | `Controllers/Api/LogsController.cs`, `Services/LogReader.cs` | One reader on `ScriptRunner`; SQL in `apptrak/sql/logs/*.sql`, no inline SQL. The S3 injection fix (operator AND/OR only, sort a known column) is kept as a whitelist. |
| `TraceController`, `TraceQueryHandler`, `trace-day/month/session.sql` | `Controllers/Api/TraceController.cs`, `Services/TraceReader.cs`, `apptrak/sql/logs/trace-*.sql` | `@Identifier` (one), no `default` connection reads. |
| `trace-people.sql`, `trace-person.sql`, `trace-day-actions.sql`, `trace-month-actions.sql`, `trace-activity.sql` | — | Not ported (R2, R3). |
| The write side (middleware, Serilog sink, client-log) | — | Census reads only. |

## 4. Log Explorer (`/logs`)

As xf-dashboard after S3, with these differences:

- **Application first.** The Application facet is open at the top of the column, and Stage
  beneath it. A link may carry `?application=` and `?stage=` (for §10's later link from Census pages).
- **Three models**: ApiRequest, Exception, Message. Session, AppEvent and MetricEvent are not models in v1.
- **Opens with results**: today, newest first.
- **Noise switches**: hide sign-in handshakes (no poll switch: T2). Quick picks: Errors, Writes, Refused, Slow today.
- **Drawer**: every column, the stored body (`ApiContent` by `Uid`), JSON pretty-printed, previous and
  next, Copy as JSON, pivots on session and correlation, and **Open session** / **This person's day** into Trace.
- **Data dense**: his 2026-09-20 layout ruling, the controls column with its splitter, Fields in a drawer.

## 5. Trace (`/trace`)

- **Pickers**: identifier, day, and application (All by default). The identifier list is every
  identifier with a request in the shown month, busiest first (calls-made-for-you, 2026-10-23).
- **Month** (S2b): a calendar month, Sunday to Saturday, with ‹ › arrows. Each day is shaded in four steps
  against the month's busiest day, with writes in the corner and a red dot for errors. A day is the browser's day: the page sends its UTC offset. The header holds the month's totals.
- **Day**: a strip of the hours with a bar per session, error ticks and action marks. A sessions table
  (start, length, requests, writes, errors, refused, actions, browser, application). **What they did**
  appears under it when the provider returns anything.
- **Session** (`/trace?session=<id>`): grouped by page load, newest first, every group collapsed, with Expand all
  and Collapse all. Writes are marked with the body one click away. Errors are red and matched to their
  request by correlation id. Messages are muted, and a gap of more than five minutes shows as idle.
  The session reads at most 3,000 requests (newest kept, and the page says so).
- **Copy trace (JSON)** and **Download**, oldest first.
- **Limits**: a day window of at most two days, a month of at most 32 days, and an offset within ±14 hours.

## 6. "What they did" — the provider seam

`IActionSource.ReadAsync(identifier, from, to)` returns `{ at, sessionId, kind, words }` rows.
Trace counts them per session, marks them on the strip, and lists them newest first, with **Open
session** when the session is that day's. It knows nothing else about the source.

- **v1**: `NoActionSource` (returns nothing; the section and the Actions column hide), and in the Demo
  profile a fixture source that reads `apptrak/seed/actions.demo.json`, so the UX can be seen and tested.
- **Later**: the target's ActivityEvent provider (T3).

## 7. Indexes — `apptrak/sql/logs/001-log-indexes.sql`

xf-dashboard's run book 36 (`migrations/2026-10-20-log-indexes.sql`) without the ActivityEvent index.
It is idempotent: an index already there is reported and skipped, and indexes are built ONLINE where the edition allows.

| Table | Index | Serves |
|---|---|---|
| ApiRequest | (SessionId, StartAt), (Identifier, StartAt), (CorrelationId), (Uid) | session, day and month, pivots, bodies |
| ApiContent | (Uid) | bodies |
| Exception | (SessionId, StartAt), (StartAt), (CorrelationId) | session, Log Explorer |
| Message | (SessionId, StartAt), (CorrelationId) | session |
| Session | (Identifier, StartAt), (SessionId) | — |

Log Explorer's default window opens on **(StartAt)**, and ApiRequest has none in the run book 36 set. The
script adds `IX_ApiRequest_StartAt` and `IX_Message_StartAt` (calls-made-for-you, 2026-10-23).

## 8. Configuration

- `Logs:ConnectionString` holds the log database. When it is unset it falls back to `MoveIt:ConnectionString`. The local Demo profile uses that fallback: the
  demo seed puts the `log` tables in the local AppTrak database.
- `Logs:Handshake` defaults to anonymous 401. `Logs:SlowMs` defaults to 2000.
- A page load is a GET whose path is outside `/api/`: fixed, not a setting (T2).

## 9. Demo fixture (manufactured, never real)

`apptrak/seed/seed-logs-demo.sql` (with `apptrak/Invoke-LogsDemo.ps1`) creates the `log` tables
(`seed/logs-demo-ddl.sql`) in a local database of its own, `CensusLogsDemo`, so it never touches log rows in a local AppTrak, from xf-dashboard's DDL (with `log.Exception.CorrelationId`, which the target has; T1). It then fills them with a manufactured month:

- about six identifiers across three applications that the AppTrak demo already names, two stages;
- sessions with page loads, API calls, writes with bodies and handshakes;
- refusals, slow calls, exceptions and messages matched by correlation, and an 11 PM request to test the day boundary.

Rows are dated relative to the run, so "today" always has data. The seed is for local use only, like
`seed-apptrak-demo.sql`.

## 10. Not doing

- Writing logs, retention, or names for identifiers (R2).
- Gates (R5).
- A link from Census application and machine pages into the logs: later, once the readers stand
  (the `?application=` parameter makes it one line).

## 11. Slices

| Slice | Scope | Verified by |
|---|---|---|
| L-1 | `apptrak/sql/logs` readers (facets, search ×3, body), `LogReader`, `LogsController`, index script, demo seed + runner. | A PowerShell test against the seeded DB: each model searches, facets count, AND/OR, sort whitelist refuses injected text, the counts equal a direct `COUNT(*)`. The index script runs twice cleanly. |
| L-2 | The Log Explorer page (§4). | Node tests on the model (cues, facet params); headless screenshots: opens on today, a facet chip, the drawer, a pivot. |
| T-1 | `trace-day/month/session.sql`, `TraceReader`, `TraceController`, `IActionSource` + the two v1 sources. | API tests: day, month on the browser's day (the 11 PM row), session limit, window refusals. |
| T-2 | The Trace page (§5). | Node tests on the timeline, grid and totals (ported); screenshots of month, day and session. |
| T-3 | Nav entries under Sys Admin, `view.log-explorer` / `view.trace` in `002-census-features.sql`, cross-links. | `Test-PersonaNav.mjs`; the Sys Admin persona sees both and the Executive sees neither. |

## 11a. Built (2026-10-23)

| Piece | File |
|---|---|
| Readers | `apptrak/sql/logs/facets.sql` (xf-dashboard's profile-sql: the table and columns checked against `sys.columns`, buckets in the browser's day by `@OffsetMinutes`), `search.sql` (facet picks as a JSON parameter compared as text, AND/OR, the request switches and quick picks, sort checked against `sys.columns` else newest first, one page with `COUNT(*) OVER ()`, the request body from `ApiContent`) |
| Server | `Services/LogReader.cs`, `Controllers/Api/LogsController.cs` (`GET api/logs/{model}/facets`, `/search`), `Options/LogsOptions.cs`, `/logs` in `HomeController` + `Views/Home/Logs.cshtml` |
| Page | `wwwroot/js/logs/` (xf-dashboard's seven modules on Census's `.fa` styles), `wwwroot/css/logs.css` |
| Nav | Troubleshoot → Log Explorer ↗ (`persona-nav.mjs`), `view.log-explorer` in `fm/002-census-features.sql` |
| Indexes | `apptrak/sql/logs/001-log-indexes.sql` |
| Demo | `apptrak/Invoke-LogsDemo.ps1`, `apptrak/seed/logs-demo-ddl.sql`, `seed-logs-demo.sql`; `Logs:ConnectionString` in the Development and Demo settings |

Changes from xf-dashboard: no names beside identifiers (R2), no poll switch (T2), no Trace links in the drawer
until Trace exists, Application and Stage lead the facets and Application is a column, Start always the first
column, `?application=` / `?stage=` open the page filtered.

**Verified (2026-10-23, against `CensusLogsDemo`):** over a 7-day window the API's totals equal a direct
`COUNT(*)`: HttpStatus 500 = 21, 401 with handshakes shown = 159, 500 OR WidgetCore = 457, 500 AND WidgetCore = 9,
Exception 21, Message `Level-nin=Information` 80. A sort with injected text falls back to newest first; an unknown
column is ignored; an unknown model is 404. The index script ran twice (second run: every index "already there").
In Edge (headless) on `/logs`: opens on today, 113 requests, the Application facet open with four applications;
500 red, refusals amber, slow bold, `{ }` on writes; a row opens the drawer with every column and the body
pretty-printed; the session pivot sets one chip and re-searches to that session's 24 requests. Node suites pass
(`Test-PersonaNav.mjs` 15, with the link-out rule now covering Troubleshoot). **Not seen:** Copy as JSON (headless
has no clipboard); the real log tables.

## 12. Open items

| # | Question | Recommendation | Needed |
|---|---|---|---|
| T1 | ~~Does the target's `log.Exception` have `CorrelationId`?~~ **Answered (Robert, 2026-10-23): yes**; its absence from xf-dashboard's April DDL was a mistake. The demo DDL includes it, errors match their request by correlation, and the index is unconditional. | — | — |
| T2 | ~~The target's polls and page-load shape.~~ **Answered (Robert, 2026-10-23):** no polls reach the logs ("if there is something like that, the endpoints are listed as exclusions so the middleware doesn't record them"), so xf-dashboard's poll fading, hatching and switch are not ported; and "i only use /api/ for api calls", so a page load is a GET outside `/api/`. | — | — |
| T3 | **The real "What they did" provider.** Parked on the AppEvent module (`app-event.md`, Robert 2026-10-23: a generic, cross-system activity log in AppTrak, not a port of the target's ActivityEvents). | When `log.AppEvent` fills: Census reads it as a fourth Log Explorer model and as Trace's action source, by `(Identifier, StartAt)` and `(SessionId, StartAt)`, showing its rendered `Message`. | app-event.md E1, E2. |
| T4 | **Does the log database's login allow Census to read it?** | Read-only grant on the `apptrak` schema (R7); step 1 of `.docs/go-live-log-explorer.md`. | DBA. |
