-- Log Explorer's rows (log-explorer-and-trace.md §4): one page of one log table in a window, filtered
-- by facet picks, newest first unless a sort is asked for. Every value is a parameter; the table,
-- the filtered columns and the sort column are checked against the table's own columns before
-- they reach the dynamic SQL, and the operator is AND or OR.
--
-- @Filters is JSON: [{"column":"HttpStatus","in":true,"values":["500","404"]}, ...]. A value is
-- compared as text, the way the facets list it.
-- Index: IX_ApiRequest_StartAt / IX_Exception_StartAt / IX_Message_StartAt (001-log-indexes.sql).

SET NOCOUNT ON;

IF @Table NOT IN (N'ApiRequest', N'Exception', N'Message') THROW 50404, N'Unknown log table.', 1;

DECLARE @object int = OBJECT_ID(N'log.' + QUOTENAME(@Table));
DECLARE @op nvarchar(5) = CASE WHEN UPPER(@Operator) = N'OR' THEN N' OR ' ELSE N' AND ' END;

DECLARE @picks nvarchar(max) = (
    SELECT STRING_AGG(
        N'(CONVERT(nvarchar(4000), t.' + QUOTENAME(c.name) COLLATE DATABASE_DEFAULT + N') '
        + CASE WHEN ISNULL(JSON_VALUE(f.value, '$.in'), 'true') = 'false' THEN N'NOT ' ELSE N'' END
        + N'IN (SELECT value FROM OPENJSON(@Filters, ''$[' + f.[key] COLLATE DATABASE_DEFAULT + N'].values'')))',
        @op) WITHIN GROUP (ORDER BY CAST(f.[key] AS int))
    FROM OPENJSON(ISNULL(@Filters, N'[]')) f
    JOIN sys.columns c ON c.object_id = @object AND c.name = JSON_VALUE(f.value, '$.column') COLLATE CATALOG_DEFAULT);

-- The request switches and quick picks, ANDed whatever the operator: the sign-in handshake (an
-- anonymous 401 before each request), writes, refusals (a 4xx other than 401), slow requests.
DECLARE @shape nvarchar(max) = CASE WHEN @Table = N'ApiRequest' THEN CONCAT(
    CASE WHEN @HideHandshake = 1 THEN N' AND NOT (t.[HttpStatus] = 401 AND ISNULL(t.[Identifier], N'''') IN (N'''', N''na''))' END,
    CASE WHEN @Writes = 1 THEN N' AND t.[HttpMethod] IN (N''POST'', N''PUT'', N''PATCH'', N''DELETE'')' END,
    CASE WHEN @Refused = 1 THEN N' AND t.[HttpStatus] >= 400 AND t.[HttpStatus] < 500 AND t.[HttpStatus] <> 401' END,
    CASE WHEN @MinElapsed > 0 THEN N' AND t.[Elapsed] >= @MinElapsed' END) ELSE N'' END;

DECLARE @sort sysname = ISNULL((SELECT name FROM sys.columns WHERE object_id = @object AND name = @SortColumn COLLATE CATALOG_DEFAULT), N'StartAt');

DECLARE @size int = CASE WHEN @PageSize BETWEEN 1 AND 200 THEN @PageSize ELSE 25 END;
DECLARE @skip int = CASE WHEN @PageIndex > 0 THEN @PageIndex ELSE 0 END * @size;

DECLARE @sql nvarchar(max) = N'
SELECT t.*' + CASE WHEN @Table = N'ApiRequest' THEN N', b.[Content] AS [RequestBody]' ELSE N'' END + N', COUNT(*) OVER () AS [Total]
FROM log.' + QUOTENAME(@Table) + N' t'
    + CASE WHEN @Table = N'ApiRequest' THEN N'
OUTER APPLY (SELECT TOP (1) c.[Content] FROM log.[ApiContent] c WHERE c.[Uid] = t.[Uid] AND c.[ContentType] = 0) b' ELSE N'' END + N'
WHERE t.[StartAt] >= @Start AND t.[StartAt] < @End' + @shape
    + CASE WHEN @picks IS NULL THEN N'' ELSE N' AND (' + @picks + N')' END + N'
ORDER BY t.' + QUOTENAME(@sort) + CASE WHEN @SortDescending = 0 THEN N' ASC' ELSE N' DESC' END + N', t.[Id] DESC
OFFSET @Skip ROWS FETCH NEXT @Size ROWS ONLY;';

EXEC sp_executesql @sql,
    N'@Start datetimeoffset, @End datetimeoffset, @Filters nvarchar(max), @MinElapsed int, @Skip int, @Size int',
    @Start = @Start, @End = @End, @Filters = @Filters, @MinElapsed = @MinElapsed, @Skip = @skip, @Size = @size;
