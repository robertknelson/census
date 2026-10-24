-- Usage (gatehouse.md §13 U-R5): the visits that arrived from another application. For each session of the application
-- in the window, its entry page (its first page load) and the application its referer belongs to: an application's
-- address is the Host its own requests recorded in the window (observed, never guessed from a name), and a session whose
-- Session.Referer is on another application's host came from it. One row per entry page and source application.
-- One application, one stage (or every stage when @Stage is NULL), a window; the sign-in handshake and @Excluded left out.
-- @Schema is Logs:Schema; the query is built with it in place, every value a parameter.
-- Index: IX_ApiRequest_Application_StartAt.

SET NOCOUNT ON;

IF OBJECT_ID(QUOTENAME(@Schema) + N'.[ApiRequest]') IS NULL THROW 50404, N'The log tables are not in this database under that schema (Logs:Schema).', 1;
IF OBJECT_ID(QUOTENAME(@Schema) + N'.[Session]') IS NULL THROW 50404, N'The Session table is not in this database under that schema (Logs:Schema).', 1;

DECLARE @q nvarchar(max) = REPLACE(N'
WITH r AS (
    SELECT SessionId, StartAt, COALESCE(NULLIF(ControllerName + N''.'' + ControllerMethod, N''.''), Path) AS Name
    FROM {s}.ApiRequest
    WHERE Application = @Application AND (@Stage IS NULL OR Stage = @Stage) AND StartAt >= @From AND StartAt < @To
      AND HttpMethod = N''GET'' AND Path NOT LIKE N''/api/%''
      AND NOT (HttpStatus = 401 AND Identifier IN (N'''', N''na''))
      AND NOT EXISTS (SELECT 1 FROM OPENJSON(@Excluded) WITH (LeftOutOf nvarchar(50) N''$.application'', LeftOut nvarchar(50) N''$.identifier'') x
                      WHERE (x.LeftOutOf = N''*'' OR x.LeftOutOf = Application) AND x.LeftOut = Identifier)
), entries AS (
    SELECT SessionId, Name AS Page FROM (
        SELECT SessionId, Name, ROW_NUMBER() OVER (PARTITION BY SessionId ORDER BY StartAt) AS Rn FROM r) x
    WHERE Rn = 1
), referred AS (
    SELECT e.Page, e.SessionId,
           LEFT(h.Rest, CHARINDEX(N''/'', h.Rest + N''/'') - 1) AS RefererHost
    FROM entries e
    CROSS APPLY (SELECT TOP (1) z.Referer FROM {s}.Session z WHERE z.SessionId = e.SessionId AND z.Referer LIKE N''%://%'') s
    CROSS APPLY (SELECT SUBSTRING(s.Referer, CHARINDEX(N''://'', s.Referer) + 3, 4000) AS Rest) h
), hosts AS (
    SELECT DISTINCT Application, Host FROM {s}.ApiRequest
    WHERE StartAt >= @From AND StartAt < @To AND Application <> @Application AND Host > N''''
)
SELECT (
    SELECT f.Page AS page, h.Application AS [from], COUNT(DISTINCT f.SessionId) AS sessions
    FROM referred f
    JOIN hosts h ON h.Host = f.RefererHost
    GROUP BY f.Page, h.Application
    ORDER BY COUNT(DISTINCT f.SessionId) DESC, f.Page
    FOR JSON PATH
) AS JsonNode;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q, N'@Application nvarchar(50), @Stage nvarchar(15), @From datetimeoffset, @To datetimeoffset, @Excluded nvarchar(max)',
    @Application = @Application, @Stage = @Stage, @From = @From, @To = @To, @Excluded = @Excluded;
