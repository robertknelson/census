# The Gatehouse package

A working reference app, carried by hand to the live app's network and ported in, piece by piece: **Feature
Management** (FM2280's grid, the sidebar and the gates), **Membership** (the membership page and the visitor welcome),
**Logs** (Log Explorer, Trace and Usage, with the usage summary) and **AppEvent** (units of business work across
systems, through `ILogger`). Everything runs on xf-dashboard-style command/query handlers and Windows
sign-in, like the live app. The spec, with every ruling and every verification: `docs/gatehouse.md`.

## First: check the copy

```powershell
.\Test-GatehousePackage.ps1        # every file against MANIFEST.sha256: missing, changed, extra
```

## What is in it

| Path | What |
|---|---|
| `Gatehouse.Web/` | The app. One folder per component, each with its own `PORTING.md` |
| `Gatehouse.Tests/` | Its tests: the gate sweep (`GateTests.cs`) is the one to port; the end-to-end tests need local databases and create rows |
| `Gatehouse.slnx` | The solution (.NET 8) |
| `docs/` | The spec (`gatehouse.md`) and Census's originals it refers to (`log-explorer-and-trace.md`, `usage.md`, `go-live-log-explorer.md`, `app-event.md`) |
| `MANIFEST.sha256`, `Test-GatehousePackage.ps1` | The checksums and their check |

## Port in this order

| # | Note | Depends on |
|---|---|---|
| 1 | `Gatehouse.Web/command-query/PORTING.md` | — |
| 2 | `Gatehouse.Web/identity/PORTING.md` | 1 |
| 3 | `Gatehouse.Web/feature-management/PORTING.md` | 1, 2 |
| 4 | `Gatehouse.Web/membership/PORTING.md` | 1, 2, 3 |
| 5 | `Gatehouse.Web/logs/PORTING.md` | 1, 3 (its scripts and styles use Feature Management's), 4 for Usage's scope |
| 6 | `Gatehouse.Web/app-events/PORTING.md` | 1, 2, 3, 4, 5, and the live sink's four fixes |

Logs without Usage's scope can go before Membership; AppEvent comes last.

## The SQL, in the order to run it

| # | Script (under `Gatehouse.Web/`) | Database | Note |
|---|---|---|---|
| 1 | `feature-management/sql/ddl/001-fm-schema.sql` | The live app's `fm` | FM2280's schema; idempotent. `fm` serves one application |
| 2 | The live app's features and their first grants | `fm` | `setup/seed-gatehouse-features.sql` is the example (insert-only); name yours for the live app's pages |
| 3 | `membership/sql/ddl/001-membership-audit.sql` | AppTrak | `membership.MembershipAudit`; idempotent |
| 4 | `membership/sql/ddl/002-membership-request.sql` | AppTrak | `membership.MembershipRequest`; idempotent |
| 5 | The live app's row in `membership.Application` and its first system-administrator | AppTrak | `setup/seed-gatehouse-membership.sql` is the example (sqlcmd variables) |
| 6 | `logs/sql/ddl/001-log-indexes.sql` | AppTrak | Key-only; out of hours on Standard edition (`docs/go-live-log-explorer.md`) |
| 7 | `app-events/sql/ddl/001-app-event.sql` | AppTrak (the log tables) | `sqlcmd -I -v Schema=<the sink's schema>`; the five columns and the indexes |
| 8 | `app-events/sql/ddl/002-app-event-kind.sql` | AppTrak | `membership.AppEventKind`, the catalog of kinds |

`setup/Invoke-GatehouseDemo.ps1` builds **local demo** databases and writes membership rows: never run it against the
real AppTrak.

## Every setting, together

```json
"ConnectionStrings": { "default": "<AppTrak>", "fm": "<the live app's fm>", "logs": "<AppTrak>" },
"Identity": { "Application": "<the live app's membership.Application identifier>", "SessionMinutes": 5 },
"FeatureAccess": { "AdminRole": "system-administrator", "DefinitionCacheDuration": "00:01:00" },
"Logs": { "Schema": "apptrak", "SlowMs": 2000 },
"Usage": { "FiscalYearStartMonth": 10, "Excluded": { "*": [] } },
"AppEvent": { "StuckHours": 4 },
"Authorization": { "SystemAdministrators": [ "<a username, for the first administrator>" ] }
```

## Decided when porting

- **Where the live app's roles come from** (open item G7): membership's (A, as built) or the live app's own (B).
  `identity/PORTING.md` sets out both.
- **The live sink** (`app-events/PORTING.md`): its schema must match `Logs:Schema`, and it needs three more fixes
  before anything calls `LogActivity`.
- **The live handlers** (open item 27 in xf-dashboard's notes): `command-query/PORTING.md` says how to check them, and
  recommends porting Gatehouse's beside them.
