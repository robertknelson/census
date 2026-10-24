-- Trace: one session's timeline (log-explorer-and-trace.md §5; ported from xf-dashboard's
-- trace-session.sql). Its requests, the newest @Max, each write with its stored request body; the
-- errors and messages logged in it; and how many requests it had in all. The sign-in handshake (an
-- anonymous 401 before each request) is left out: a GET outside /api/ would otherwise read as a page.
-- @Schema is Logs:Schema (R7); the query is built with it in place, every value a parameter.
-- Index: IX_ApiRequest_SessionId_StartAt, IX_ApiContent_Uid, IX_Exception_SessionId_StartAt,
-- IX_Message_SessionId_StartAt.

SET NOCOUNT ON;

IF OBJECT_ID(QUOTENAME(@Schema) + N'.[ApiRequest]') IS NULL THROW 50404, N'The log tables are not in this database under that schema (Logs:Schema).', 1;

-- The request body's columns: BodyType and Body on the live AppTrak, ContentType and Content on the demo (G8).
DECLARE @bodyType sysname = CASE WHEN COL_LENGTH(QUOTENAME(@Schema) + N'.[ApiContent]', N'BodyType') IS NOT NULL THEN N'BodyType' ELSE N'ContentType' END;
DECLARE @body sysname = CASE WHEN @bodyType = N'BodyType' THEN N'Body' ELSE N'Content' END;

DECLARE @q nvarchar(max) = REPLACE(REPLACE(REPLACE(N'
WITH Requests AS (
    SELECT r.*
    FROM {s}.ApiRequest r
    WHERE r.SessionId = @SessionId AND NOT (r.HttpStatus = 401 AND r.Identifier IN (N'''', N''na''))
)
SELECT (
    SELECT
        (SELECT COUNT(*) FROM Requests) AS totalRequests,
        JSON_QUERY(COALESCE((
            SELECT TOP (@Max)
                   r.Id AS id, r.StartAt AS [at], r.Elapsed AS ms, r.HttpStatus AS status, r.HttpMethod AS method,
                   r.Path AS path, r.QueryString AS query, r.ControllerName AS controller, r.ControllerMethod AS action,
                   r.CorrelationId AS correlationId, r.HasError AS hasError, r.Identifier AS identifier,
                   r.Application AS application, r.Stage AS stage, r.Browser AS browser, r.Platform AS platform,
                   JSON_QUERY(CASE WHEN ISJSON(b.Body) = 1 THEN b.Body END) AS body
            FROM Requests r
            OUTER APPLY (SELECT TOP (1) c.{body} AS Body FROM {s}.ApiContent c WHERE c.Uid = r.Uid AND c.{bodyType} = 0) b
            ORDER BY r.StartAt DESC
            FOR JSON PATH, INCLUDE_NULL_VALUES
        ), N''[]'')) AS requests,
        JSON_QUERY(COALESCE((
            SELECT e.StartAt AS [at], e.Level AS level, e.Message AS message, e.Path AS path,
                   e.CorrelationId AS correlationId, e.SourceContext AS source
            FROM {s}.Exception e
            WHERE e.SessionId = @SessionId
            ORDER BY e.StartAt
            FOR JSON PATH, INCLUDE_NULL_VALUES
        ), N''[]'')) AS exceptions,
        JSON_QUERY(COALESCE((
            SELECT m.StartAt AS [at], m.Level AS level, m.Message AS message, m.Path AS path,
                   m.CorrelationId AS correlationId, m.SourceContext AS source
            FROM {s}.Message m
            WHERE m.SessionId = @SessionId
            ORDER BY m.StartAt
            FOR JSON PATH, INCLUDE_NULL_VALUES
        ), N''[]'')) AS messages
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
) AS JsonNode;', N'{s}', QUOTENAME(@Schema)), N'{bodyType}', QUOTENAME(@bodyType)), N'{body}', QUOTENAME(@body));

EXEC sp_executesql @q, N'@SessionId nvarchar(50), @Max int', @SessionId = @SessionId, @Max = @Max;
