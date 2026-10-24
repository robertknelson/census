# Porting Logs: Log Explorer, Trace and Usage

Port after command/query and Feature Management (its scripts and styles are needed). Spec:
`docs/gatehouse.md` §7 and §9c; the originals are Census's (`docs/log-explorer-and-trace.md`,
`docs/usage.md`).

## What the live app already has

The log tables, written by its ILogger/Serilog sinks: `apptrak.ApiRequest`, `apptrak.Exception`, `apptrak.Message` in
AppTrak. Gatehouse writes no logs; these pages only read.

## Copy

| Files | What |
|---|---|
| `LogsOptions.cs` | `Logs:Schema`, `Logs:SlowMs`, Usage's fiscal start and friction thresholds |
| `data/LogsSqlCommandInitializer.cs` | Keys `…logs.*`; the schema and thresholds come from settings, never the request |
| `api/LogsControllers.cs` | `LogsQueryHandler` (the `logs` connection) and the three APIs, each behind its page's feature |
| `sql/` | Census's scripts, unchanged. They build dynamic SQL with the schema in place and check every column name a request names against the table's own columns |
| `views/` | The three pages |
| `LogsPageController.cs` | The three page actions; each tells its page which of the other two the reader may open |
| `wwwroot/js/logs/`, `trace/`, `usage/`, `wwwroot/css/logs.css`, `trace.css`, `usage.css` | The modules and styles. They need Feature Management's `feature-access` utilities and `feature-access.css` (`.fa`) |

The one rule in `site.css` these pages use: `.gh-main:has(> .gh-logs) { padding: 0; }`, so they take the whole main
column. Use the live layout's equivalent.

## Program.cs

```csharp
builder.Services.Configure<LogsOptions>(builder.Configuration.GetSection(LogsOptions.SectionName));
builder.Services.Configure<UsageOptions>(builder.Configuration.GetSection(UsageOptions.SectionName));
builder.Services.AddTransient<ISqlCommandInitializer, LogsSqlCommandInitializer>();
builder.Services.AddScoped<LogsQueryHandler>();
```

## Settings

```json
"ConnectionStrings": { "logs": "<AppTrak: the same as default>" },
"Logs": { "Schema": "apptrak", "SlowMs": 2000 },
"Usage": { "FiscalYearStartMonth": 10 }
```

Usage's friction thresholds (`Usage:Friction:*`) default to Census's; tune them against real volume (open item U8 in
`docs/usage.md`).

## SQL to run

The log indexes: `sql/ddl/001-log-indexes.sql`, key-only, as Census's go-live does (`docs/go-live-log-explorer.md`:
drop the three wide indexes first if an earlier version of the script ran, and mind the locking warning on Standard
edition). Then the features `logs.explorer`, `logs.trace` and `logs.usage` and their grants (Feature Management's step
2).

## The sidebar

Three items under Logs, each naming its feature (`Features.LogsExplorer`, `LogsTrace`, `LogsUsage`), as in
`Navigation.cs`.

## Check after porting

- Each page with its feature on; with it off for your role, no item and 403 on the page and its API.
- Log Explorer's total for a day against `SELECT COUNT(*) FROM apptrak.ApiRequest WHERE StartAt >= … AND StartAt < …`.
- A Trace session with many requests (its JSON runs well past 2,000 characters) opens: this is the check that the
  handler reads long `FOR JSON` whole (command/query's PORTING.md).
- Usage for the live app over a month: the pages are its controller and action names; open item U9 in `docs/usage.md` (registry
  names against the logs' `Application` names) applies.
- With Trace off for a role that has Usage, Usage's sessions are plain text, not links.
