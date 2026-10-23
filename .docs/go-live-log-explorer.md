# Go-live: Log Explorer, Trace and Usage

Spec: `features/log-explorer-and-trace.md`. Census reads the shared log tables (`[apptrak].[ApiRequest]` and the rest,
in the AppTrak database); it writes nothing to them.
Independent of the personas go-live (`go-live-personas.md`): `/logs` is its own page and needs no `fm` or
`membership` schema.

## 1. Census's login can read the log tables (T4)

In AppTrak, as a DBA (skip if Census's login already reads the `apptrak` schema):

```sql
GRANT SELECT ON SCHEMA::[apptrak] TO [<census login's user>];
```

Check, as Census's login: `SELECT TOP (1) Id FROM apptrak.ApiRequest;` returns a row.

## 2. Tell Census where the logs are

Nothing, in the real environment: the log tables are in AppTrak, which `MoveIt:ConnectionString` already names, and
`Logs:Schema` defaults to `apptrak`. Only if that changes:

```json
"Logs": { "ConnectionString": "<another database>", "Schema": "<its schema>" }
```

With no connection string at all, `/logs` is 404. A wrong schema says so on the page ("The log table is not in this
database under that schema").

## 3. Deploy main, open `/logs`

It opens on today's requests, newest first. Check: the Application facet lists your applications with counts;
Errors today switches to Exception; a row opens the drawer with its body (writes only). **Open session** in the
drawer goes to `/trace`: the identifier's month, the day's sessions, the session grouped by page. `/usage`
opens on the busiest application this month: figures, pages (a page opens its drawer) and people.

## 4. The indexes — `apptrak/sql/logs/001-log-indexes.sql` (R4)

The pages work without them, slowly (Usage most of all: `IX_ApiRequest_Application_StartAt` is its index): every search scans tables that are kept forever. Run the script on AppTrak
(`@schema` at its top is `apptrak`) when the build can take the time:

- **Enterprise / Developer / Azure:** built ONLINE; the apps keep logging while it runs.
- **Standard (no ONLINE):** each index locks its table while it builds, so the apps' log writes **wait** on
  `ApiRequest` for the length of its build. Run it out of hours.

Check: run it a second time; every line says "already there".

**If you ran the script before 2026-10-23's slimming (commit 4d3af7f)**, three indexes exist with extra columns, and
the script skips an index whose name is already there. Drop them first, then run the script again to build them lean:

```sql
DROP INDEX IF EXISTS IX_ApiRequest_Application_StartAt ON apptrak.ApiRequest;
DROP INDEX IF EXISTS IX_ApiRequest_SessionId_StartAt ON apptrak.ApiRequest;
DROP INDEX IF EXISTS IX_ApiRequest_Identifier_StartAt ON apptrak.ApiRequest;
```

(On Standard edition the rebuild locks the table while it runs, as above: out of hours.)

Size check before running, so the wait is known:

```sql
SELECT t.name, SUM(p.rows) AS rows FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE SCHEMA_NAME(t.schema_id) = 'apptrak' AND t.name IN ('ApiRequest', 'ApiContent', 'Exception', 'Message', 'Session') GROUP BY t.name ORDER BY rows DESC;
```

## 5. (With the personas go-live) the nav item

`apptrak/sql/fm/002-census-features.sql` now adds `view.log-explorer` and `view.trace` (granted to
`system-administrator`) and `view.usage` (product-owner, application-owner, technical-lead, devops-lead,
application-administrator, system-administrator: usage.md U2). It is insert-only: re-running it on the real AppTrak
adds the three features and their grants and changes nothing else. The persona UX then shows **Troubleshoot →
Log Explorer ↗, Trace ↗** and **See → Usage**, scoped to each member's applications; the period view closes with
Usage's figures per application. Check one member: their applications appear in Usage's picker, and any that log
under a different name are listed at the foot as having no rows (usage.md U9).
