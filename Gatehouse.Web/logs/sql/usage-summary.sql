-- Usage's figures for every application at once (usage.md §5, U5): the Executive's row per application in the
-- period view. One stage (PROD in the view), a window; the sign-in handshake left out. People, sessions, and the
-- sessions whose last request came within @EndedWithinMinutes of a failure.
-- @Schema is Logs:Schema (R7); the query is built with it in place, every value a parameter.
-- Index: IX_ApiRequest_StartAt (its INCLUDE carries Application, Stage, Identifier, HttpStatus).

-- Gatehouse: @Excluded (Usage:Excluded, gatehouse.md §13 U-R3) is a JSON array of { application, identifier }; an
-- application of * means every one. Those identifiers' requests are left out of every figure.
SET NOCOUNT ON;

IF OBJECT_ID(QUOTENAME(@Schema) + N'.[ApiRequest]') IS NULL THROW 50404, N'The log tables are not in this database under that schema (Logs:Schema).', 1;

DECLARE @q nvarchar(max) = REPLACE(N'
WITH r AS (
    SELECT Application, SessionId, Identifier, StartAt, StopAt,
           CASE WHEN HttpStatus >= 500 OR HasError = 1 THEN 1 ELSE 0 END AS Failed
    FROM {s}.ApiRequest
    WHERE (@Stage IS NULL OR Stage = @Stage) AND StartAt >= @From AND StartAt < @To
      AND NOT (HttpStatus = 401 AND Identifier IN (N'''', N''na''))
      AND NOT EXISTS (SELECT 1 FROM OPENJSON(@Excluded) WITH (LeftOutOf nvarchar(50) N''$.application'', LeftOut nvarchar(50) N''$.identifier'') x
                      WHERE (x.LeftOutOf = N''*'' OR x.LeftOutOf = Application) AND x.LeftOut = Identifier)
), sessions AS (
    SELECT Application, SessionId, MAX(StopAt) AS EndAt FROM r GROUP BY Application, SessionId
), ended AS (
    SELECT s.Application, s.SessionId,
           CASE WHEN EXISTS (SELECT 1 FROM r f WHERE f.Application = s.Application AND f.SessionId = s.SessionId AND f.Failed = 1
                               AND f.StartAt >= DATEADD(minute, -@EndedWithinMinutes, s.EndAt)) THEN 1 ELSE 0 END AS EndedOnError
    FROM sessions s
)
SELECT (
    SELECT s.Application AS application,
           (SELECT COUNT(DISTINCT x.Identifier) FROM r x WHERE x.Application = s.Application AND x.Identifier NOT IN (N'''', N''na'')) AS people,
           COUNT(*) AS sessions, SUM(s.EndedOnError) AS endedOnError
    FROM ended s
    GROUP BY s.Application
    ORDER BY s.Application
    FOR JSON PATH, INCLUDE_NULL_VALUES
) AS JsonNode;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q, N'@Stage nvarchar(15), @From datetimeoffset, @To datetimeoffset, @EndedWithinMinutes int, @Excluded nvarchar(max)',
    @Stage = @Stage, @From = @From, @To = @To, @EndedWithinMinutes = @EndedWithinMinutes, @Excluded = @Excluded;
