# Go-live: Log Explorer

Spec: `features/log-explorer-and-trace.md`. Census reads the shared `log` tables; it writes nothing to them.
Independent of the personas go-live (`go-live-personas.md`): `/logs` is its own page and needs no `fm` or
`membership` schema.

## 1. Census's login can read the log tables (T4)

On the database that holds the `log` schema, as a DBA:

```sql
GRANT SELECT ON SCHEMA::[log] TO [<census login's user>];
```

Check, as Census's login: `SELECT TOP (1) Id FROM log.ApiRequest;` returns a row.

## 2. Tell Census where the logs are

In the real server's `appsettings.Production.json` (or its environment), if the log tables are not in the
AppTrak database Move It already reads:

```json
"Logs": { "ConnectionString": "Server=<server>;Database=<log database>;Integrated Security=true;TrustServerCertificate=true" }
```

Absent, Census reads the `log` schema in `MoveIt:ConnectionString`'s database. With neither, `/logs` is 404.

## 3. Deploy main, open `/logs`

It opens on today's requests, newest first. Check: the Application facet lists your applications with counts;
Errors today switches to Exception; a row opens the drawer with its body (writes only).

## 4. The indexes — `apptrak/sql/logs/001-log-indexes.sql` (R4)

The page works without them, slowly: every search scans tables that are kept forever. Run the script on the log
database when the build can take the time:

- **Enterprise / Developer / Azure:** built ONLINE; the apps keep logging while it runs.
- **Standard (no ONLINE):** each index locks its table while it builds, so the apps' log writes **wait** on
  `ApiRequest` for the length of its build. Run it out of hours.

Check: run it a second time; every line says "already there".

Size check before running, so the wait is known:

```sql
SELECT t.name, SUM(p.rows) AS rows FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE SCHEMA_NAME(t.schema_id) = 'log' GROUP BY t.name ORDER BY rows DESC;
```

## 5. (With the personas go-live) the nav item

`apptrak/sql/fm/002-census-features.sql` now adds `view.log-explorer`, granted to `system-administrator`.
It is insert-only: re-running it on the real AppTrak adds the one feature and its grant and changes nothing
else. The persona UX then shows **Troubleshoot → Log Explorer ↗**.
