-- The kinds the events name (gatehouse.md §12.3), with how many events each has, how many in the last @Days days, when
-- it was last seen and which applications sent it: what the catalog screen sets beside the registered kinds, so a kind
-- seen but not registered can be registered (observe, then declare). On the logs database. Read-only.
-- @Schema is Logs:Schema; the query is built with it in place, every value a parameter.
-- Index: IX_AppEvent_Kind.

SET NOCOUNT ON;

IF OBJECT_ID(QUOTENAME(@Schema) + N'.[AppEvent]') IS NULL THROW 50404, N'The AppEvent table is not in this database under that schema (Logs:Schema).', 1;

DECLARE @q nvarchar(max) = REPLACE(N'
WITH kinds AS (
    SELECT Namespace, CommandName, COUNT(*) AS Events, MAX(StartAt) AS LastSeen,
           SUM(CASE WHEN StartAt >= DATEADD(day, -@Days, SYSDATETIMEOFFSET()) THEN 1 ELSE 0 END) AS Recent
    FROM {s}.AppEvent
    GROUP BY Namespace, CommandName
), senders AS (
    SELECT DISTINCT Namespace, CommandName, Application FROM {s}.AppEvent
)
SELECT k.Namespace AS namespace, k.CommandName AS commandName, k.Events AS events, k.Recent AS recent, k.LastSeen AS lastSeen,
       (SELECT STRING_AGG(CONVERT(nvarchar(max), x.Application), N'', '') WITHIN GROUP (ORDER BY x.Application)
        FROM senders x WHERE x.Namespace = k.Namespace AND x.CommandName = k.CommandName) AS applications
FROM kinds k
ORDER BY k.LastSeen DESC;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q, N'@Days int', @Days = @Days;
