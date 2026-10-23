-- Usage (usage.md §4.3): every session's page loads in order, the newest @Cap sessions, for the path trees (built in the browser).
-- Pages are joined by NCHAR(30), which no page name holds.
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
, seq AS (
    SELECT TOP (@Cap) SessionId, MAX(Identifier) AS Identifier, MIN(StartAt) AS StartAt,
           STRING_AGG(CONVERT(nvarchar(max), Page), NCHAR(30)) WITHIN GROUP (ORDER BY StartAt) AS Pages
    FROM loads
    GROUP BY SessionId
    ORDER BY MIN(StartAt) DESC
)
SELECT (
    SELECT (SELECT COUNT(DISTINCT SessionId) FROM loads) AS sessions,
           JSON_QUERY(COALESCE((
               SELECT SessionId AS sessionId, Identifier AS identifier, StartAt AS [at], Pages AS pages
               FROM seq ORDER BY StartAt DESC
               FOR JSON PATH), N''[]'')) AS sequences
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
) AS JsonNode;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q, N'@Application nvarchar(50), @Stage nvarchar(15), @From datetimeoffset, @To datetimeoffset, @OffsetMinutes int, @SlowMs int, @Cap int',
    @Application = @Application, @Stage = @Stage, @From = @From, @To = @To, @OffsetMinutes = @OffsetMinutes, @SlowMs = @SlowMs, @Cap = @Cap;
