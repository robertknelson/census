-- Usage (usage.md §4.5): page loads by the browser's weekday and hour, with a few sessions per cell.
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
, cells AS (
    -- The weekday (0 Monday .. 6 Sunday, whatever DATEFIRST says) and hour of each page load, in the browser time.
    SELECT DATEDIFF(day, CAST(''19000101'' AS date), CAST(SWITCHOFFSET(StartAt, @OffsetMinutes) AS date)) % 7 AS Dow,
           DATEPART(hour, SWITCHOFFSET(StartAt, @OffsetMinutes)) AS Hour,
           SessionId, Identifier, StartAt
    FROM loads
), firsts AS (
    SELECT Dow, Hour, SessionId, MIN(Identifier) AS Identifier, MIN(StartAt) AS StartAt,
           ROW_NUMBER() OVER (PARTITION BY Dow, Hour ORDER BY MIN(StartAt) DESC) AS Rn
    FROM cells GROUP BY Dow, Hour, SessionId
)
SELECT (
    SELECT c.Dow AS dow, c.Hour AS [hour], COUNT(*) AS loads, COUNT(DISTINCT c.SessionId) AS sessions, COUNT(DISTINCT c.Identifier) AS people,
           JSON_QUERY((SELECT f.SessionId AS sessionId, f.Identifier AS identifier, f.StartAt AS [at]
                       FROM firsts f WHERE f.Dow = c.Dow AND f.Hour = c.Hour AND f.Rn <= 5 ORDER BY f.StartAt DESC FOR JSON PATH)) AS examples
    FROM cells c
    GROUP BY c.Dow, c.Hour
    ORDER BY c.Dow, c.Hour
    FOR JSON PATH, INCLUDE_NULL_VALUES
) AS JsonNode;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q, N'@Application nvarchar(50), @Stage nvarchar(15), @From datetimeoffset, @To datetimeoffset, @OffsetMinutes int, @SlowMs int',
    @Application = @Application, @Stage = @Stage, @From = @From, @To = @To, @OffsetMinutes = @OffsetMinutes, @SlowMs = @SlowMs;
