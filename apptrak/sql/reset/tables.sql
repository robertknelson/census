-- What a reset would take: each asserted table (reset.AssertedTable) and its rows now.
SET NOCOUNT ON;

DECLARE @counts TABLE (TableName sysname, WipeOrder int, Note nvarchar(200), RowsNow int NULL);
INSERT @counts (TableName, WipeOrder, Note) SELECT TableName, WipeOrder, Note FROM reset.AssertedTable;

DECLARE @t sysname, @n int, @sql nvarchar(max);
DECLARE tables CURSOR LOCAL FAST_FORWARD FOR SELECT TableName FROM @counts WHERE OBJECT_ID(TableName, 'U') IS NOT NULL;
OPEN tables;
FETCH NEXT FROM tables INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'SELECT @n = COUNT(*) FROM ' + QUOTENAME(PARSENAME(@t, 2)) + N'.' + QUOTENAME(PARSENAME(@t, 1)) + N';';
    EXEC sys.sp_executesql @sql, N'@n int OUTPUT', @n = @n OUTPUT;
    UPDATE @counts SET RowsNow = @n WHERE TableName = @t;
    FETCH NEXT FROM tables INTO @t;
END;
CLOSE tables;
DEALLOCATE tables;

SELECT TableName, Note, RowsNow FROM @counts ORDER BY WipeOrder;
