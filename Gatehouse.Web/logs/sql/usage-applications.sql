-- Usage's pickers (usage.md §4): the applications and stages with requests in the window, busiest first.
-- @Schema is Logs:Schema (R7); the query is built with it in place, every value a parameter.
-- Index: IX_ApiRequest_StartAt (its INCLUDE carries Application and Stage).

-- Gatehouse: @Excluded (Usage:Excluded, gatehouse.md §13 U-R3) is a JSON array of { application, identifier }; an
-- application of * means every one. Those identifiers' requests are left out of every figure.
SET NOCOUNT ON;

IF OBJECT_ID(QUOTENAME(@Schema) + N'.[ApiRequest]') IS NULL THROW 50404, N'The log tables are not in this database under that schema (Logs:Schema).', 1;

DECLARE @q nvarchar(max) = REPLACE(N'
SELECT Application AS application, Stage AS stage, COUNT(*) AS requests
FROM {s}.ApiRequest
WHERE StartAt >= @From AND StartAt < @To
      AND NOT EXISTS (SELECT 1 FROM OPENJSON(@Excluded) WITH (LeftOutOf nvarchar(50) N''$.application'', LeftOut nvarchar(50) N''$.identifier'') x
                      WHERE (x.LeftOutOf = N''*'' OR x.LeftOutOf = Application) AND x.LeftOut = Identifier)
GROUP BY Application, Stage
ORDER BY Application, COUNT(*) DESC;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q, N'@From datetimeoffset, @To datetimeoffset, @Excluded nvarchar(max)', @From = @From, @To = @To, @Excluded = @Excluded;
