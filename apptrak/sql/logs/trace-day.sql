-- Trace: one identifier's sessions in a window, the browser's day (log-explorer-and-trace.md §5; ported
-- from xf-dashboard's trace-day.sql, one identifier, no polls). One row per session: its application,
-- when it began and ended, its requests, writes, refusals and failed requests, the errors logged in it,
-- and the moments of each failure and error for the strip's red ticks.
-- @Schema is Logs:Schema (R7); the query is built with it in place, every value a parameter.
-- Index: IX_ApiRequest_Identifier_StartAt, IX_Exception_SessionId_StartAt.

SET NOCOUNT ON;

IF OBJECT_ID(QUOTENAME(@Schema) + N'.[ApiRequest]') IS NULL THROW 50404, N'The log tables are not in this database under that schema (Logs:Schema).', 1;

DECLARE @q nvarchar(max) = REPLACE(N'
WITH Requests AS (
    SELECT r.SessionId, r.Application, r.Stage, r.StartAt, r.StopAt, r.HttpMethod, r.HttpStatus, r.HasError, r.Browser, r.Platform
    FROM {s}.ApiRequest r
    WHERE r.Identifier = @Identifier AND r.StartAt >= @From AND r.StartAt < @To
), Sessions AS (
    SELECT SessionId,
           MAX(Application) AS Application,
           MAX(Stage) AS Stage,
           MIN(StartAt) AS StartAt,
           MAX(StopAt) AS EndAt,
           COUNT(*) AS Requests,
           SUM(CASE WHEN HttpMethod IN (N''POST'', N''PUT'', N''PATCH'', N''DELETE'') THEN 1 ELSE 0 END) AS Writes,
           SUM(CASE WHEN HttpStatus >= 400 AND HttpStatus < 500 AND HttpStatus <> 401 THEN 1 ELSE 0 END) AS Refused,
           SUM(CASE WHEN HttpStatus >= 500 OR HasError = 1 THEN 1 ELSE 0 END) AS FailedRequests,
           MAX(Browser) AS Browser,
           MAX(Platform) AS Platform
    FROM Requests
    GROUP BY SessionId
)
SELECT (
    SELECT s.SessionId AS sessionId, s.Application AS application, s.Stage AS stage, s.StartAt AS startAt, s.EndAt AS endAt,
           s.Requests AS requests, s.Writes AS writes, s.Refused AS refused, s.FailedRequests AS failedRequests,
           (SELECT COUNT(*) FROM {s}.Exception e WHERE e.SessionId = s.SessionId AND e.StartAt >= @From AND e.StartAt < @To) AS errors,
           s.Browser AS browser, s.Platform AS platform,
           JSON_QUERY(COALESCE((
               SELECT x.At AS [at]
               FROM (SELECT r.StartAt AS At FROM Requests r WHERE r.SessionId = s.SessionId AND (r.HttpStatus >= 500 OR r.HasError = 1)
                     UNION ALL
                     SELECT e.StartAt FROM {s}.Exception e WHERE e.SessionId = s.SessionId AND e.StartAt >= @From AND e.StartAt < @To) x
               ORDER BY x.At
               FOR JSON PATH
           ), N''[]'')) AS failuresAt
    FROM Sessions s
    ORDER BY s.StartAt
    FOR JSON PATH, INCLUDE_NULL_VALUES
) AS JsonNode;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q, N'@Identifier nvarchar(50), @From datetimeoffset, @To datetimeoffset',
    @Identifier = @Identifier, @From = @From, @To = @To;
