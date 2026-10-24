-- Log Explorer's facets (log-explorer-and-trace.md §4): for each asked column of one log table,
-- its values in the window with counts. A date column is bucketed by a pattern (StartAt-yyyy-mm-dd)
-- in the browser's own day (@OffsetMinutes from UTC). Ported from xf-dashboard's profile-sql.sql;
-- the table and the columns are checked against the table's own columns, the window is a
-- parameter, and the end is exclusive.
--
-- @Columns is a JSON array: ["Application","Stage","StartAt-yyyy-mm-dd","HttpStatus"]
-- Index: IX_ApiRequest_StartAt / IX_Exception_StartAt / IX_Message_StartAt (001-log-indexes.sql).

SET NOCOUNT ON;

IF @Table NOT IN (N'ApiRequest', N'Exception', N'Message', N'AppEvent') THROW 50404, N'Unknown log table.', 1;

-- @Schema is Logs:Schema (apptrak in the real AppTrak; xf-dashboard's DDL says log).
DECLARE @from nvarchar(300) = QUOTENAME(@Schema) + N'.' + QUOTENAME(@Table);
DECLARE @object int = OBJECT_ID(@from);
IF @object IS NULL THROW 50404, N'The log table is not in this database under that schema (Logs:Schema).', 1;
DECLARE @sql nvarchar(max);

DECLARE @noise nvarchar(400) = CASE WHEN @Table = N'ApiRequest' AND @HideHandshake = 1
    THEN N' AND NOT ([HttpStatus] = 401 AND ISNULL([Identifier], N'''') IN (N'''', N''na''))' ELSE N'' END;

WITH asked AS (
    SELECT TRIM(value) AS pattern, CAST([key] AS int) AS ordinal
    FROM OPENJSON(ISNULL(@Columns, N'[]'))
), parsed AS (
    SELECT ordinal,
           CASE WHEN CHARINDEX(N'-', pattern) > 0 THEN LEFT(pattern, CHARINDEX(N'-', pattern) - 1) ELSE pattern END AS name,
           CASE WHEN CHARINDEX(N'-', pattern) > 0 THEN SUBSTRING(pattern, CHARINDEX(N'-', pattern) + 1, 40) END AS bucket
    FROM asked
), picked AS (
    SELECT p.ordinal, c.name COLLATE DATABASE_DEFAULT AS name,
           CASE p.bucket
               WHEN N'yyyy-mm-dd' THEN N'yyyy-MM-dd'
               WHEN N'yyyy-mm' THEN N'yyyy-MM'
               WHEN N'hh' THEN N'HH'
               WHEN N'dd:hh' THEN N'dd:HH'
           END AS format
    FROM parsed p
    JOIN sys.columns c ON c.object_id = @object AND c.name = p.name COLLATE CATALOG_DEFAULT
)
SELECT @sql = STRING_AGG(CONVERT(nvarchar(max),
    N'SELECT N''' + name + N''' AS [Facet], '
    + CASE WHEN format IS NULL
        THEN N'CONVERT(nvarchar(255), ' + QUOTENAME(name) + N')'
        ELSE N'FORMAT(SWITCHOFFSET(' + QUOTENAME(name) + N', @OffsetMinutes), N''' + format + N''')' END
    + N' AS [Value], COUNT(*) AS [Count] FROM ' + @from
    + N' WHERE ' + QUOTENAME(name) + N' IS NOT NULL AND [StartAt] >= @Start AND [StartAt] < @End' + @noise
    + N' GROUP BY '
    + CASE WHEN format IS NULL
        THEN N'CONVERT(nvarchar(255), ' + QUOTENAME(name) + N')'
        ELSE N'FORMAT(SWITCHOFFSET(' + QUOTENAME(name) + N', @OffsetMinutes), N''' + format + N''')' END),
    N' UNION ALL ') WITHIN GROUP (ORDER BY ordinal)
FROM picked;

IF @sql IS NULL
BEGIN
    SELECT CAST(NULL AS nvarchar(128)) AS [Facet], CAST(NULL AS nvarchar(255)) AS [Value], 0 AS [Count] WHERE 1 = 0;
    RETURN;
END

SET @sql = @sql + N' ORDER BY [Facet], [Count] DESC;';

EXEC sp_executesql @sql,
    N'@Start datetimeoffset, @End datetimeoffset, @OffsetMinutes int',
    @Start = @Start, @End = @End, @OffsetMinutes = @OffsetMinutes;
