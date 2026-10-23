-- Usage (usage.md §4.4): the six friction signals, each with its sessions (examples into Trace). The rules'
-- thresholds are settings (Usage:Friction), passed in.
-- One application, one stage (or every stage when @Stage is NULL), a window; the sign-in handshake left out.
-- A page is a GET outside /api/, named by the controller and action the app recorded, else its path (§3).
-- Every request belongs to the page load it came after in its session (Grp). Computed live, no roll-up (U3).
-- @Schema is Logs:Schema (R7); the query is built with it in place, every value a parameter.
-- Index: IX_ApiRequest_Application_StartAt.

SET NOCOUNT ON;

IF OBJECT_ID(QUOTENAME(@Schema) + N'.[ApiRequest]') IS NULL THROW 50404, N'The log tables are not in this database under that schema (Logs:Schema).', 1;

DECLARE @q nvarchar(max) = REPLACE(N'
WITH r AS (
    SELECT SessionId, Identifier, StartAt, StopAt, Elapsed, HttpMethod, HttpStatus, HasError, Roles, Path,
           COALESCE(NULLIF(ControllerName + N''.'' + ControllerMethod, N''.''), Path) AS Name,
           CASE WHEN HttpMethod = N''GET'' AND Path NOT LIKE N''/api/%'' THEN 1 ELSE 0 END AS IsPage,
           CASE WHEN HttpStatus >= 500 OR HasError = 1 THEN 1 ELSE 0 END AS Failed,
           CASE WHEN HttpStatus >= 400 AND HttpStatus < 500 AND HttpStatus <> 401 THEN 1 ELSE 0 END AS Refused,
           CASE WHEN Elapsed >= @SlowMs THEN 1 ELSE 0 END AS Slow
    FROM {s}.ApiRequest
    WHERE Application = @Application AND (@Stage IS NULL OR Stage = @Stage) AND StartAt >= @From AND StartAt < @To
      AND NOT (HttpStatus = 401 AND Identifier IN (N'''', N''na''))
), g AS (
    SELECT r.*, SUM(IsPage) OVER (PARTITION BY SessionId ORDER BY StartAt, IsPage DESC ROWS UNBOUNDED PRECEDING) AS Grp
    FROM r
), loads AS (
    SELECT SessionId, Identifier, StartAt, Grp, Name AS Page,
           LAG(Name) OVER (PARTITION BY SessionId ORDER BY StartAt) AS PrevPage,
           LEAD(Name) OVER (PARTITION BY SessionId ORDER BY StartAt) AS NextPage,
           LEAD(StartAt) OVER (PARTITION BY SessionId ORDER BY StartAt) AS NextAt
    FROM g WHERE IsPage = 1
), calls AS (
    SELECT g.*, l.Page FROM g JOIN loads l ON l.SessionId = g.SessionId AND l.Grp = g.Grp WHERE g.IsPage = 0
)
, failures AS (
    -- A request that failed, with the page it was made on.
    SELECT g.SessionId, g.Identifier, g.StartAt, g.Name, COALESCE(l.Page, g.Name) AS Page
    FROM g LEFT JOIN loads l ON l.SessionId = g.SessionId AND l.Grp = g.Grp
    WHERE g.Failed = 1
), sessionEnds AS (
    SELECT SessionId, MAX(Identifier) AS Identifier, MIN(StartAt) AS StartAt, MAX(StopAt) AS EndAt FROM r GROUP BY SessionId
), endedOnError AS (
    -- The last failure of a session, when it came within @EndedWithinMinutes of its end.
    SELECT s.SessionId, s.Identifier, s.StartAt, x.Name, x.Page
    FROM sessionEnds s
    CROSS APPLY (SELECT TOP (1) f.Name, f.Page FROM failures f
                 WHERE f.SessionId = s.SessionId AND f.StartAt >= DATEADD(minute, -@EndedWithinMinutes, s.EndAt)
                 ORDER BY f.StartAt DESC) x
), refusedRuns AS (
    SELECT SessionId, MAX(Identifier) AS Identifier, MIN(StartAt) AS StartAt, Name, COUNT(*) AS Refusals
    FROM g WHERE Refused = 1
    GROUP BY SessionId, Name
    HAVING COUNT(*) >= @RefusedTimes
), loopRuns AS (
    -- @LoopLoads or more loads of one page within @LoopSeconds, in one session.
    SELECT a.SessionId, MAX(a.Identifier) AS Identifier, MIN(a.StartAt) AS StartAt, a.Page, MAX(c.Loads) AS Loads
    FROM loads a
    CROSS APPLY (SELECT COUNT(*) AS Loads FROM loads b
                 WHERE b.SessionId = a.SessionId AND b.Page = a.Page
                   AND b.StartAt >= a.StartAt AND b.StartAt < DATEADD(second, @LoopSeconds, a.StartAt)) c
    WHERE c.Loads >= @LoopLoads
    GROUP BY a.SessionId, a.Page
), writes AS (
    SELECT SessionId, Identifier, StartAt, Name,
           LAG(StartAt) OVER (PARTITION BY SessionId, HttpMethod, Path ORDER BY StartAt) AS PrevAt
    FROM g WHERE HttpMethod IN (N''POST'', N''PUT'', N''PATCH'', N''DELETE'')
), retries AS (
    SELECT SessionId, Identifier, StartAt, Name FROM writes
    WHERE PrevAt IS NOT NULL AND DATEDIFF(millisecond, PrevAt, StartAt) <= @RetrySeconds * 1000
), paged AS (
    SELECT g.SessionId, g.Identifier, g.StartAt, g.Elapsed, COALESCE(l.Page, g.Name) AS Page
    FROM g LEFT JOIN loads l ON l.SessionId = g.SessionId AND l.Grp = g.Grp
), p90 AS (
    SELECT DISTINCT Page,
           PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY Elapsed) OVER (PARTITION BY Page) AS P90,
           COUNT(*) OVER (PARTITION BY Page) AS Requests
    FROM paged
), slowPages AS (
    SELECT Page, P90, Requests FROM p90 WHERE Requests >= @SlowMinRequests AND P90 >= @SlowMs
), exits AS (
    SELECT Page, COUNT(*) AS Views, SUM(CASE WHEN NextPage IS NULL THEN 1 ELSE 0 END) AS Exits FROM loads GROUP BY Page
), exitMedian AS (
    SELECT TOP (1) PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CAST(Exits AS float) / Views) OVER () AS Median FROM exits
), deadEnds AS (
    SELECT e.Page, e.Views, e.Exits, m.Median
    FROM exits e CROSS JOIN exitMedian m
    WHERE e.Views >= @DeadEndMinViews AND CAST(e.Exits AS float) / e.Views >= @DeadEndMinRate
      AND CAST(e.Exits AS float) / e.Views >= @DeadEndFactor * m.Median
)
SELECT (
    SELECT
        JSON_QUERY(COALESCE((
            SELECT e.Name AS [call], e.Page AS page, COUNT(*) AS sessions, COUNT(DISTINCT e.Identifier) AS people,
                   JSON_QUERY((SELECT TOP (20) x.SessionId AS sessionId, x.Identifier AS identifier, x.StartAt AS [at]
                               FROM endedOnError x WHERE x.Name = e.Name AND x.Page = e.Page ORDER BY x.StartAt DESC FOR JSON PATH)) AS examples
            FROM endedOnError e GROUP BY e.Name, e.Page ORDER BY COUNT(*) DESC
            FOR JSON PATH), N''[]'')) AS endedOnError,
        JSON_QUERY(COALESCE((
            SELECT f.Name AS [call], COUNT(*) AS sessions, COUNT(DISTINCT f.Identifier) AS people, SUM(f.Refusals) AS refusals,
                   JSON_QUERY((SELECT TOP (20) x.SessionId AS sessionId, x.Identifier AS identifier, x.StartAt AS [at]
                               FROM refusedRuns x WHERE x.Name = f.Name ORDER BY x.StartAt DESC FOR JSON PATH)) AS examples
            FROM refusedRuns f GROUP BY f.Name ORDER BY COUNT(*) DESC
            FOR JSON PATH), N''[]'')) AS refused,
        JSON_QUERY(COALESCE((
            SELECT o.Page AS page, COUNT(*) AS sessions, COUNT(DISTINCT o.Identifier) AS people, MAX(o.Loads) AS loads,
                   JSON_QUERY((SELECT TOP (20) x.SessionId AS sessionId, x.Identifier AS identifier, x.StartAt AS [at]
                               FROM loopRuns x WHERE x.Page = o.Page ORDER BY x.StartAt DESC FOR JSON PATH)) AS examples
            FROM loopRuns o GROUP BY o.Page ORDER BY COUNT(*) DESC
            FOR JSON PATH), N''[]'')) AS loops,
        JSON_QUERY(COALESCE((
            SELECT t.Name AS [call], COUNT(*) AS retries, COUNT(DISTINCT t.SessionId) AS sessions, COUNT(DISTINCT t.Identifier) AS people,
                   JSON_QUERY((SELECT TOP (20) x.SessionId AS sessionId, x.Identifier AS identifier, MIN(x.StartAt) AS [at]
                               FROM retries x WHERE x.Name = t.Name GROUP BY x.SessionId, x.Identifier ORDER BY MIN(x.StartAt) DESC FOR JSON PATH)) AS examples
            FROM retries t GROUP BY t.Name ORDER BY COUNT(*) DESC
            FOR JSON PATH), N''[]'')) AS retries,
        JSON_QUERY(COALESCE((
            SELECT s.Page AS page, s.P90 AS p90, s.Requests AS requests,
                   (SELECT COUNT(DISTINCT p.SessionId) FROM paged p WHERE p.Page = s.Page AND p.Elapsed >= @SlowMs) AS sessions,
                   (SELECT COUNT(DISTINCT p.Identifier) FROM paged p WHERE p.Page = s.Page AND p.Elapsed >= @SlowMs) AS people,
                   JSON_QUERY((SELECT TOP (20) x.SessionId AS sessionId, x.Identifier AS identifier, MAX(x.StartAt) AS [at]
                               FROM paged x WHERE x.Page = s.Page AND x.Elapsed >= @SlowMs
                               GROUP BY x.SessionId, x.Identifier ORDER BY MAX(x.StartAt) DESC FOR JSON PATH)) AS examples
            FROM slowPages s ORDER BY s.P90 DESC
            FOR JSON PATH), N''[]'')) AS slow,
        JSON_QUERY(COALESCE((
            SELECT d.Page AS page, d.Views AS views, d.Exits AS exits, d.Median AS medianExitRate,
                   (SELECT COUNT(DISTINCT l.Identifier) FROM loads l WHERE l.Page = d.Page AND l.NextPage IS NULL) AS people,
                   JSON_QUERY((SELECT TOP (20) l.SessionId AS sessionId, l.Identifier AS identifier, l.StartAt AS [at]
                               FROM loads l WHERE l.Page = d.Page AND l.NextPage IS NULL ORDER BY l.StartAt DESC FOR JSON PATH)) AS examples
            FROM deadEnds d ORDER BY CAST(d.Exits AS float) / d.Views DESC
            FOR JSON PATH), N''[]'')) AS deadEnds
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
) AS JsonNode;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q, N'@Application nvarchar(50), @Stage nvarchar(15), @From datetimeoffset, @To datetimeoffset, @OffsetMinutes int, @SlowMs int, @EndedWithinMinutes int, @RefusedTimes int, @LoopLoads int, @LoopSeconds int, @RetrySeconds int, @SlowMinRequests int, @DeadEndFactor float, @DeadEndMinRate float, @DeadEndMinViews int',
    @Application = @Application, @Stage = @Stage, @From = @From, @To = @To, @OffsetMinutes = @OffsetMinutes, @SlowMs = @SlowMs,
    @EndedWithinMinutes = @EndedWithinMinutes, @RefusedTimes = @RefusedTimes, @LoopLoads = @LoopLoads, @LoopSeconds = @LoopSeconds,
    @RetrySeconds = @RetrySeconds, @SlowMinRequests = @SlowMinRequests, @DeadEndFactor = @DeadEndFactor, @DeadEndMinRate = @DeadEndMinRate, @DeadEndMinViews = @DeadEndMinViews;
