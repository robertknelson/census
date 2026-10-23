-- Trace: one identifier's month, one row per day with anything in it (log-explorer-and-trace.md §5;
-- ported from xf-dashboard's trace-month.sql, one identifier, no polls). Days are the browser's days:
-- @OffsetMinutes is its offset from UTC, so an 11 PM request lands on its own day.
-- @Schema is Logs:Schema (R7); the query is built with it in place, every value a parameter.
-- Index: IX_ApiRequest_Identifier_StartAt (one seek over the month), IX_Exception_SessionId_StartAt.

SET NOCOUNT ON;

IF OBJECT_ID(QUOTENAME(@Schema) + N'.[ApiRequest]') IS NULL THROW 50404, N'The log tables are not in this database under that schema (Logs:Schema).', 1;

DECLARE @q nvarchar(max) = REPLACE(N'
WITH Requests AS (
    SELECT CAST(SWITCHOFFSET(r.StartAt, @OffsetMinutes) AS date) AS Day, r.SessionId, r.HttpMethod, r.HttpStatus, r.HasError
    FROM {s}.ApiRequest r
    WHERE r.Identifier = @Identifier AND r.StartAt >= @From AND r.StartAt < @To
), Errors AS (
    SELECT CAST(SWITCHOFFSET(e.StartAt, @OffsetMinutes) AS date) AS Day, COUNT(*) AS Errors
    FROM {s}.Exception e
    WHERE e.StartAt >= @From AND e.StartAt < @To
      AND e.SessionId IN (SELECT DISTINCT r.SessionId FROM Requests r)
    GROUP BY CAST(SWITCHOFFSET(e.StartAt, @OffsetMinutes) AS date)
), Days AS (
    SELECT r.Day,
           COUNT(*) AS Requests,
           SUM(CASE WHEN r.HttpMethod IN (N''POST'', N''PUT'', N''PATCH'', N''DELETE'') THEN 1 ELSE 0 END) AS Writes,
           SUM(CASE WHEN r.HttpStatus >= 500 OR r.HasError = 1 THEN 1 ELSE 0 END) AS FailedRequests,
           COUNT(DISTINCT r.SessionId) AS Sessions
    FROM Requests r
    GROUP BY r.Day
)
SELECT (
    SELECT CONVERT(char(10), d.Day, 120) AS [day], d.Requests AS requests, d.Writes AS writes,
           d.FailedRequests AS failedRequests, ISNULL(e.Errors, 0) AS errors, d.Sessions AS sessions
    FROM Days d
    LEFT JOIN Errors e ON e.Day = d.Day
    ORDER BY d.Day
    FOR JSON PATH, INCLUDE_NULL_VALUES
) AS JsonNode;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q, N'@Identifier nvarchar(50), @From datetimeoffset, @To datetimeoffset, @OffsetMinutes int',
    @Identifier = @Identifier, @From = @From, @To = @To, @OffsetMinutes = @OffsetMinutes;
