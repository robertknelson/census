# AppEvent — following a unit of work across systems

Status: **spec, 2026-10-23, not built.** A cross-cutting AppTrak logging module, kept in Census for
now ("this does not impact Census. i'm just using Census as the DTO carrier for this module").
Census only reads the results (log-explorer-and-trace.md T3).

## 1. The ask (Robert, 2026-10-23)

"I want to build a more generic solution as an integral part of AppTrak, and use
ILogger.LogActivity(...) or something like that to use the serilog pipeline … generic enough to
handle just about anything, and handle multiple apps, multiple stages just like the entire apptrak
logging."

The intent, in his words:
- MetricEvent "was intended to store metrics about execution". AppEvent "truly was intended to
  record UseCase execution, or 'interesting events' that an exec would want to slice, dice,
  aggregate so they can know what their systems are actually doing".
- "If one application/system initiated a business activity, and it sent a request to another
  app/system to perform some work, the 'work order' … could have a Uid that the target system would
  be able to publish an event that travelled back to my AppEvent Api … the logging could follow a
  unique unit of work across a java system, a .net system, perhaps mainframe, etc."
- "Then the exec could see how long things take, what the throughput is, bottlenecks, counts per
  week, month, etc." "This is why the real apptrak is API based, taking in logging from many
  separate applications."

## 2. What exists (read 2026-10-23, schema only)

| Piece | State |
|---|---|
| `log.AppEvent` (also `apptrak.AppEvent`, same shape) | Envelope: Id, Uid, Identifier, Path, SessionId, CorrelationId, Machine, Stage, Application, StartAt. Event: Namespace, CommandName, CommandActivity, Body, Data. CreatedAt, IsFromApi, ExecuteOn/ExecuteAt computed. Primary key only. Empty locally. |
| `log.MetricEvent` | Technical: Component, Model, ModelAction, Name, Type, RequestElapsed, CommandElapsed, DbKey, CommandStartAt, CommandText, CommandType, HttpStatus, Count. Primary key only. Empty. |
| xf-dashboard sink (`.xf/logging/sinks`) | Already routes an event to `log.AppEvent`: a message template starting `[appevent:` (`SerilogMessageTemplates.AppEventFormat`) with the event as a serialized `appevent` property; `SqlServerLogger` batches them and `SqlSinkExtensions.Post` writes them. **Nothing calls it.** |
| The sink's `ToAppEvent` | Sets `StartAt = now` at the sink, overwriting when the event happened, and takes Machine from the sink's host. Both are wrong for an event reported by another system (§5). |

## 3. Rulings

| # | Ruling | Consequence |
|---|---|---|
| A1 | **Census is the carrier, not the owner** (Robert). | The spec and any first code live here until the module has its home (open item E4); nothing in Census depends on it. |
| A2 | **Multi-app, multi-stage, API-ingested**, like the rest of the `log` schema (Robert). | The envelope stays as every log table has it; non-.NET senders post to the AppTrak API. |

## 4. Design (recommendations; each reversible until built)

| # | Decision | Why |
|---|---|---|
| D1 | **AppEvent is the activity table; no new table.** MetricEvent stays technical (timings, commands). | AppEvent was built for exactly this and is empty. An activity is a fact about who did what; a metric is a measurement. One table for both becomes a junk drawer nobody can aggregate. |
| D2 | **Add `WorkUid`**: the unit of work's key, minted where the work starts and carried by every system that touches it. **Keep `Uid` as the event's own key**, with a unique index. | None of the existing ids crosses systems: Uid is the row, CorrelationId one request in one app, SessionId one browser. Uid unique makes a retried post a no-op. |
| D3 | **Optional `ParentUid`**: the event that caused this one. | It turns a flat list into the tree of hand-offs (A asks B and C; B asks D). A sender that does not know it leaves it empty. |
| D4 | **`CommandActivity` holds a small fixed lifecycle vocabulary** (recommended, pending E1): `created`, `handed-off`, `received`, `started`, `completed`, `failed`. | It is what makes the module generic: an exec view computes duration, waiting, working and failure for any kind of work in any system without knowing the process. Free text here and every report is per-process. |
| D5 | **`Namespace` + `CommandName` name the kind of work** (`underwriting` / `quote-request`), kebab-case, from a **registered catalog** in AppTrak (E5). | The Java and .NET sides must call the same work by the same name. Declared, not inferred from naming (the 2025 lesson). An unregistered kind is still stored and flagged, never dropped. |
| D6 | **Add `Subject` columns, `SubjectType` + `SubjectKey`**: the record the event is about (`policy` / `123`). | Without it the log answers "what did this person do" but not "what happened to policy 123". Columns, not JSON in Body, so they can be indexed. |
| D7 | **Add `Message`: the rendered plain words** ("Completed step 5 on Acme renewal"), from the Serilog message template at write time. | xf-dashboard turned kinds into words in the browser (`describeAction`), one app's vocabulary hard-coded. Across many apps the words must arrive with the event; any reader shows them. |
| D8 | **Body is the business payload (JSON); Data the leftover properties**, as the other log tables do. A dimension sliced often (line of business, region) becomes an indexed computed column when it earns one. | `OPENJSON` over a table kept forever is slow; promote on demand, not up front. |
| D9 | **`StartAt` is when it happened, at the sender; `CreatedAt` when AppTrak took it in.** The sink stops overwriting StartAt (§2). Machine is the sender's. | Clocks on different machines disagree, and events arrive late. Business flows run in minutes or hours, so the sender's clock is good enough. Arrival lag (CreatedAt − StartAt) is itself a health signal. |
| D10 | **Late, out-of-order and duplicate arrival are normal.** Readers order by StartAt, never by Id; duplicates fall to the unique Uid. | API ingestion with retries guarantees all three. |
| D11 | **Not the audit of record.** | The pipeline batches and swallows failures (the ApiContent insert failed silently on every POST in xf-dashboard). Activity answers what happened, for troubleshooting and insight; audit tables (PreviousValue / NewValue) stay where a record must be guaranteed. |

**Columns added to `log.AppEvent`** (only if E2 says nothing writes it yet): `WorkUid nvarchar(36) NULL`,
`ParentUid nvarchar(36) NULL`, `SubjectType nvarchar(50) NULL`, `SubjectKey nvarchar(100) NULL`,
`Message nvarchar(500) NULL`. All nullable: a plain "interesting event" that is not part of a unit of work is still valid.

## 5. Write paths

**.NET, through Serilog** — the extension he named:

```csharp
logger.LogActivity("underwriting", "quote-request", Activity.Created,
    "Requested a quote for {Insured}", new { insured, lob },
    work: workUid, subject: ("policy", policyId));
```

- It logs through `ILogger` with the existing `[appevent:` marker. The sink's routing is unchanged.
- Identifier, SessionId and CorrelationId come from the log context the middleware already pushes,
  and Application and Stage from configuration. The caller supplies none of them.
- A background job logs the same way, with a service identity and no session.
- `ToAppEvent` is fixed per D9 and fills the new columns.

**Everything else, through the AppTrak API**: `POST /api/app-event`, a single event or an array, carrying the envelope
(Application, Stage, Machine, Identifier, StartAt) plus the event fields. `IsFromApi = 1`.
- Idempotent on Uid: a retry returns 200 and writes nothing.
- Java, the mainframe (E3) and the cross-cutting API's custom sink all use it.
- A rejected event (missing Application, Stage, Uid or Namespace/CommandName, or a CommandActivity outside D4)
  returns 400 with the reason, so the sender learns at once.

**Handing off a unit of work**: the system that creates it logs `created`, sends the WorkUid with the
request (a field in the work order, or a header such as `X-Work-Uid`), and logs `handed-off`. The receiver logs
`received`, `started`, then `completed` or `failed`, all under the same WorkUid.

## 6. Indexes

| Index | Serves |
|---|---|
| `UX_AppEvent_Uid` (unique) | Idempotent ingestion |
| `(WorkUid, StartAt)` | One unit of work's timeline |
| `(Namespace, CommandName, StartAt)` INCLUDE (CommandActivity, Application, Stage) | Throughput, durations and counts by kind over a period |
| `(Identifier, StartAt)` | A person's actions (Trace's "What they did") |
| `(SessionId, StartAt)` | A session's timeline |
| `(SubjectType, SubjectKey, StartAt)` | Everything that happened to one record |

Logs are kept forever, so the indexes go in with the columns, not later. Pre-computed weekly and monthly summaries
only when queries over the raw rows get slow.

## 7. What the executive gets (query shapes)

- **How long it takes**: per WorkUid, `MAX(StartAt) − MIN(StartAt)` where the last is `completed`. Median and 90th
  percentile by kind per month.
- **Where it waits**: `handed-off` → `received` is time in a queue between systems; `started` → `completed`
  is time being worked. A bottleneck is usually the first.
- **Throughput**: `completed` per week or month, by kind, application and stage.
- **What breaks**: `failed` against `completed`, by kind and by the system that failed.
- **Stuck work**: a WorkUid with `handed-off` and no `received` after N hours.
- **Who talks to whom**: hand-offs between applications, observed. This is evidence of a link between systems,
  which Atlas could read later (not in scope).

## 8. Not doing

- Distributed tracing at the HTTP level (OpenTelemetry spans): this tracks business units of work. The id shape
  (32-hex or a GUID) stays compatible if a bridge is ever wanted.
- Summary tables, dashboards, alerting: after the events flow.
- Replacing any audit table (D11).

## 9. Open items

| # | Question | Recommendation | Needed |
|---|---|---|---|
| E1 | **What was `CommandActivity` meant to hold?** | The lifecycle vocabulary (D4). If it meant something else, that meaning moves to a column of its own and the lifecycle takes this one. | His answer. |
| E2 | **Can AppEvent's shape still change?** Does anything write `log.AppEvent` in the real AppTrak or any app? (Nothing in xf-dashboard calls the sink's path.) | If nothing writes it: add the D2/D3/D6/D7 columns. If something does: nullable columns are still safe, but the existing rows' CommandActivity values need mapping. | His check on the real tables and senders. |
| E3 | **How does the mainframe report?** | HTTP to the ingest API if it can call out; otherwise a file or queue drop that an AppTrak job loads through the same validation. | What the mainframe side can do. |
| E4 | **Where does the module's code live?** The `LogActivity` extension and sink fix belong in the shared logging library every .NET app references; the ingest endpoint in the real AppTrak API. | Spec here; code in those two homes once named. A Census copy only if he wants to prove it end to end on the demo first. | The repo names. |
| E5 | **Where does the catalog of work kinds live?** | An AppTrak table beside the application registry: Namespace, CommandName, display words, owning application. Ingest flags kinds not in it. | His ruling; it is a new table in AppTrak, not in `log`. |
