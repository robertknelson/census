# Go-live: Log Explorer and Trace

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
drawer goes to `/trace`: the identifier's month, the day's sessions, the session grouped by page.

## 4. The indexes — `apptrak/sql/logs/001-log-indexes.sql` (R4)

The page works without them, slowly: every search scans tables that are kept forever. Run the script on AppTrak
(`@schema` at its top is `apptrak`) when the build can take the time:

- **Enterprise / Developer / Azure:** built ONLINE; the apps keep logging while it runs.
- **Standard (no ONLINE):** each index locks its table while it builds, so the apps' log writes **wait** on
  `ApiRequest` for the length of its build. Run it out of hours.

Check: run it a second time; every line says "already there".

Size check before running, so the wait is known:

```sql
SELECT t.name, SUM(p.rows) AS rows FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE SCHEMA_NAME(t.schema_id) = 'apptrak' AND t.name IN ('ApiRequest', 'ApiContent', 'Exception', 'Message', 'Session') GROUP BY t.name ORDER BY rows DESC;
```

## 5. (With the personas go-live) the nav item

`apptrak/sql/fm/002-census-features.sql` now adds `view.log-explorer` and `view.trace`, granted to
`system-administrator`. It is insert-only: re-running it on the real AppTrak adds the two features and their grants
and changes nothing else. The persona UX then shows **Troubleshoot → Log Explorer ↗, Trace ↗**.
