# Porting AppEvent

Port after command/query, identity, Feature Management, Membership and Logs (its catalog is in Membership's schema and
audit, its raw events are a Log Explorer model). Spec: `docs/gatehouse.md` §12; the design: `docs/app-event.md`.

## What the live app already has

- The `AppEvent` table, empty (AE-R2), in the log tables' schema. **Check which schema the live sink writes:**
  xf-dashboard's says `INSERT INTO [log].[AppEvent]`, while the pages read `Logs:Schema` (`apptrak`). The two must agree.
- Its Serilog sink, which already routes the `[appevent:` template to that table (`SqlServerLogger`,
  `SinkExtensions.ToAppEvent`, `SqlSinkExtensions.Post`). Nothing calls it yet.
- Outside applications' calls are solved there already (AE-R7). Gatehouse adds only the `ILogger` path.

## The live sink: four fixes before anything calls LogActivity

| # | Fix | Why |
|---|---|---|
| 1 | Write to the schema the pages read (`Logs:Schema`), or set `Logs:Schema` to the sink's | Otherwise the events land where no page looks |
| 2 | In `ToAppEvent`, keep the event's own `Log.Uid` and `Log.StartAt`; do not replace `Log` with a fresh `LogInfo` | It empties the Uid and overwrites when the work happened (D9). The unique index skips empty Uids only so that the unfixed sink fails quietly instead of on every second event |
| 3 | Take the envelope (Identifier, SessionId, CorrelationId, Application, Stage, Machine) from the log context where the event left it empty | Callers name the work, not the environment |
| 4 | Add `WorkUid`, `ParentUid`, `SubjectType`, `SubjectKey`, `Message` to `XF.Common.AppEvent` and to the insert | `LogActivity` sends them (`AppActivityLogging.Serialize` shows the JSON) |

The sink must keep `QUOTED_IDENTIFIER ON` (SqlClient's default): the filtered indexes refuse writes without it.

## Copy

| Files | What |
|---|---|
| `logging/AppActivity.cs` | `AppActivity`, `logger.LogActivity(…)` (checks the event, logs the template), `AppActivity.DerivedUid` |
| `logging/AppEventLoggerProvider.cs` | **Reference only, do not port**: Gatehouse's stand-in for the live sink. It shows what the fixed sink writes |
| `data/` | `AppEventsSqlCommandInitializer` (keys `…app-events.*`), `AppEventCommandHandler`, `AppEventNames` (kebab-case, NOUN-VERB, the six activities) |
| `sql/` | The catalog's scripts (AppTrak) and the units of work's (the logs connection); `app-event-write.sql` is the stand-in's |
| `api/`, `AppEventPageControllers.cs`, `views/` | `/app-events`, `/app-events/work/{workUid}`, `/admin/app-event-kinds` and their APIs |
| `wwwroot/js/app-events/`, `wwwroot/css/app-events.css` | The pages (on Membership's `membership.css` look and its `utils/format.mjs`) |
| `../logs/` changes | Log Explorer's AppEvent model: `search.sql` and `facets.sql` accept `AppEvent`; `LogsController` gates the model; `models.mjs` and `log-explorer-page.mjs` show it when the page is told to |
| `../membership/AccessRequest.cs` and the `LogActivity` calls in `WelcomeController` and `MembershipController` | Gatehouse's own unit of work; port with the welcome if you want it |

## Program.cs

```csharp
builder.Services.AddTransient<ISqlCommandInitializer, AppEventsSqlCommandInitializer>();
builder.Services.AddScoped<AppEventCommandHandler>();
builder.Services.Configure<AppEventOptions>(builder.Configuration.GetSection(AppEventOptions.SectionName));
// Gatehouse only, standing in for the live sink:
//   builder.Services.AddSingleton<AppEventQueue>();
//   builder.Services.AddSingleton<ILoggerProvider, AppEventLoggerProvider>();
//   builder.Services.AddHostedService<AppEventWriter>();
```

## Settings

```json
"AppEvent": { "StuckHours": 4 }
```

(`Application` and `Stage` are the stand-in's; the live sink has its own.)

## SQL to run

1. `sql/ddl/001-app-event.sql` on the log tables' database, with `sqlcmd -I -v Schema=<the sink's schema>`. It adds the
   five columns and the indexes. On Standard edition each index locks the table while it builds, so run it before
   anything writes.
2. `sql/ddl/002-app-event-kind.sql` on AppTrak: `membership.AppEventKind`.
3. The kinds you already know (`setup/seed-gatehouse-app-event-kinds.sql` is the example), or register them on the
   screen as they appear.
4. The features `logs.app-events` and `admin.app-event-kinds`, granted to system-administrator.

## Logging one

```csharp
var created = logger.LogActivity(new AppActivity
{
    Namespace = "underwriting", CommandName = "quote-request", Activity = "created",
    WorkUid = workUid, SubjectType = "policy", SubjectKey = policyId,
    Message = $"Requested a quote for {insured}", Body = new { insured, lob },
});
// … hand it off, and the next step names its cause:
logger.LogActivity(new AppActivity { …, Activity = "handed-off", ParentUid = created });
```

## Check after porting

- A malformed `LogActivity` (an activity outside the six, `quote` as a command) throws in a unit test.
- Log one unit of work through the fixed sink; `/app-events` lists it; its page shows the steps, and its status follows
  the rules (completed by its creator, failed, stuck after `StuckHours`, running).
- Log Explorer's AppEvent total for a day equals `SELECT COUNT(*)` on the table for that day.
- A kind logged but not registered appears under "Seen, not registered" on `/admin/app-event-kinds`.
