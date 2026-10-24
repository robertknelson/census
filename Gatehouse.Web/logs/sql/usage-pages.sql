-- Usage (usage.md §4.2): one row per page: views, people, time on page, entries, exits, and its calls' failures and slow share.
-- One application, one stage (or every stage when @Stage is NULL), a window; the sign-in handshake left out.
-- A page is a GET outside /api/, named by the controller and action the app recorded, else its path (§3).
-- Every request belongs to the page load it came after in its session (Grp). Computed live, no roll-up (U3).
-- @Schema is Logs:Schema (R7); the query is built with it in place, every value a parameter.
-- Index: IX_ApiRequest_Application_StartAt.

-- Gatehouse: @Excluded (Usage:Excluded, gatehouse.md §13 U-R3) is a JSON array of { application, identifier }; an
-- application of * means every one. Those identifiers' requests are left out of every figure.
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
      AND NOT EXISTS (SELECT 1 FROM OPENJSON(@Excluded) WITH (LeftOutOf nvarchar(50) N''$.application'', LeftOut nvarchar(50) N''$.identifier'') x
                      WHERE (x.LeftOutOf = N''*'' OR x.LeftOutOf = Application) AND x.LeftOut = Identifier)
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
, timed AS (
    SELECT l.*, CASE WHEN NextAt IS NOT NULL THEN DATEDIFF(second, StartAt, NextAt) END AS Seconds FROM loads l
), medians AS (
    SELECT DISTINCT Page, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY Seconds) OVER (PARTITION BY Page) AS MedianSeconds
    FROM timed WHERE Seconds IS NOT NULL
), byPage AS (
    SELECT Page, COUNT(*) AS Views, COUNT(DISTINCT Identifier) AS People,
           SUM(CASE WHEN PrevPage IS NULL THEN 1 ELSE 0 END) AS Entries,
           SUM(CASE WHEN NextPage IS NULL THEN 1 ELSE 0 END) AS Exits
    FROM loads GROUP BY Page
), byCalls AS (
    SELECT Page, COUNT(*) AS Calls, SUM(Failed) AS Failed, SUM(Refused) AS Refused, SUM(Slow) AS Slow FROM calls GROUP BY Page
)
SELECT (
    SELECT p.Page AS page, p.Views AS views, p.People AS people, m.MedianSeconds AS medianSeconds,
           p.Entries AS entries, p.Exits AS exits,
           ISNULL(c.Calls, 0) AS calls, ISNULL(c.Failed, 0) AS failed, ISNULL(c.Refused, 0) AS refused, ISNULL(c.Slow, 0) AS slow
    FROM byPage p
    LEFT JOIN medians m ON m.Page = p.Page
    LEFT JOIN byCalls c ON c.Page = p.Page
    ORDER BY p.Views DESC, p.Page
    FOR JSON PATH, INCLUDE_NULL_VALUES
) AS JsonNode;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q, N'@Application nvarchar(50), @Stage nvarchar(15), @From datetimeoffset, @To datetimeoffset, @OffsetMinutes int, @SlowMs int, @Excluded nvarchar(max)',
    @Application = @Application, @Stage = @Stage, @From = @From, @To = @To, @OffsetMinutes = @OffsetMinutes, @SlowMs = @SlowMs, @Excluded = @Excluded;
