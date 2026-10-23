-- Trace's identifier picker (log-explorer-and-trace.md §5): everyone with a request in the window,
-- busiest first, with the applications they used. The identifier is the person (R2); the sign-in
-- handshake's empty identifier is not one.
-- @Schema is Logs:Schema (R7); the query is built with it in place, every value a parameter.
-- Index: IX_ApiRequest_StartAt (its INCLUDE carries Identifier and Application).

SET NOCOUNT ON;

IF OBJECT_ID(QUOTENAME(@Schema) + N'.[ApiRequest]') IS NULL THROW 50404, N'The log tables are not in this database under that schema (Logs:Schema).', 1;

DECLARE @q nvarchar(max) = REPLACE(N'
WITH used AS (
    SELECT Identifier, Application, COUNT(*) AS Requests
    FROM {s}.ApiRequest
    WHERE StartAt >= @From AND StartAt < @To AND Identifier NOT IN (N'''', N''na'')
    GROUP BY Identifier, Application
)
SELECT Identifier AS identifier, SUM(Requests) AS requests,
       STRING_AGG(CONVERT(nvarchar(max), Application), N'', '') WITHIN GROUP (ORDER BY Requests DESC) AS applications
FROM used
GROUP BY Identifier
ORDER BY SUM(Requests) DESC, Identifier;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q, N'@From datetimeoffset, @To datetimeoffset', @From = @From, @To = @To;
