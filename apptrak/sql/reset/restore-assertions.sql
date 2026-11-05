-- Undoes one reset (census-on-apptrak.md §5): puts every row its snapshot kept back, with its own id.
-- Only into empty tables: anything written since the reset would collide with what comes back, so
-- reset again first (that keeps the newer work too) and then restore. Returns the ResetId.
-- Refuses 50410 unless armed, 50404 for an unknown reset, 50410 when restored already or when an
-- asserted table holds rows. Parameters: @ResetId, @Actor.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties
               WHERE class = 0 AND name = N'AllowAssertionReset' AND CAST(value AS nvarchar(10)) = N'1')
    THROW 50410, 'This database is not armed for a reset. Run apptrak/sql/reset/002-arm-reset.sql on it by hand, and never on production.', 1;

IF NOT EXISTS (SELECT 1 FROM reset.Reset WHERE ResetId = @ResetId)
    THROW 50404, 'No such reset.', 1;

IF EXISTS (SELECT 1 FROM reset.Reset WHERE ResetId = @ResetId AND RestoredAt IS NOT NULL)
    THROW 50410, 'That reset was restored already.', 1;

BEGIN TRANSACTION;

DECLARE @t sysname, @q nvarchar(300), @json nvarchar(max), @n int, @sql nvarchar(max), @cols nvarchar(max), @with nvarchar(max), @identity bit;
DECLARE @busy nvarchar(max) = N'';

DECLARE tables CURSOR LOCAL FAST_FORWARD FOR
    SELECT TableName FROM reset.AssertedTable WHERE OBJECT_ID(TableName, 'U') IS NOT NULL ORDER BY WipeOrder;
OPEN tables;
FETCH NEXT FROM tables INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'SELECT @n = COUNT(*) FROM ' + QUOTENAME(PARSENAME(@t, 2)) + N'.' + QUOTENAME(PARSENAME(@t, 1)) + N' WITH (TABLOCKX, HOLDLOCK);';
    EXEC sys.sp_executesql @sql, N'@n int OUTPUT', @n = @n OUTPUT;
    IF @n > 0 SET @busy += CASE WHEN @busy = N'' THEN N'' ELSE N', ' END + @t + N' (' + CAST(@n AS nvarchar(10)) + N')';
    FETCH NEXT FROM tables INTO @t;
END;
CLOSE tables;
DEALLOCATE tables;

IF @busy <> N''
BEGIN
    DECLARE @msg nvarchar(2000) = N'Rows have been written since the reset: ' + @busy + N'. Reset again first (that keeps them), then restore.';
    THROW 50410, @msg, 1;
END;

DECLARE snaps CURSOR LOCAL FAST_FORWARD FOR
    SELECT s.TableName, s.RowsJson
    FROM reset.Snapshot s
    JOIN reset.AssertedTable a ON a.TableName = s.TableName
    WHERE s.ResetId = @ResetId AND s.RowsTaken > 0 AND OBJECT_ID(s.TableName, 'U') IS NOT NULL
    ORDER BY a.WipeOrder DESC;
OPEN snaps;
FETCH NEXT FROM snaps INTO @t, @json;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @q = QUOTENAME(PARSENAME(@t, 2)) + N'.' + QUOTENAME(PARSENAME(@t, 1));

    SELECT @cols = STRING_AGG(CAST(QUOTENAME(c.name) AS nvarchar(max)), N', ') WITHIN GROUP (ORDER BY c.column_id),
           @with = STRING_AGG(CAST(QUOTENAME(c.name) + N' ' +
                   CASE WHEN ty.name IN (N'varchar', N'char')
                            THEN ty.name + N'(' + CASE WHEN c.max_length = -1 THEN N'max' ELSE CAST(c.max_length AS nvarchar(10)) END + N')'
                        WHEN ty.name IN (N'nvarchar', N'nchar')
                            THEN ty.name + N'(' + CASE WHEN c.max_length = -1 THEN N'max' ELSE CAST(c.max_length / 2 AS nvarchar(10)) END + N')'
                        WHEN ty.name IN (N'decimal', N'numeric')
                            THEN ty.name + N'(' + CAST(c.precision AS nvarchar(5)) + N',' + CAST(c.scale AS nvarchar(5)) + N')'
                        WHEN ty.name IN (N'datetime2', N'datetimeoffset', N'time')
                            THEN ty.name + N'(' + CAST(c.scale AS nvarchar(5)) + N')'
                        ELSE ty.name END
                   + N' ''$."' + REPLACE(c.name, N'''', N'''''') + N'"''' AS nvarchar(max)), N', ') WITHIN GROUP (ORDER BY c.column_id)
    FROM sys.columns c
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID(@t) AND c.is_computed = 0;

    SET @identity = CASE WHEN EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(@t) AND is_identity = 1) THEN 1 ELSE 0 END;

    SET @sql = CASE WHEN @identity = 1 THEN N'SET IDENTITY_INSERT ' + @q + N' ON; ' ELSE N'' END
             + N'INSERT ' + @q + N' (' + @cols + N') SELECT ' + @cols + N' FROM OPENJSON(@json) WITH (' + @with + N');'
             + CASE WHEN @identity = 1 THEN N' SET IDENTITY_INSERT ' + @q + N' OFF;' ELSE N'' END;
    EXEC sys.sp_executesql @sql, N'@json nvarchar(max)', @json = @json;

    FETCH NEXT FROM snaps INTO @t, @json;
END;
CLOSE snaps;
DEALLOCATE snaps;

UPDATE reset.Reset SET RestoredAt = SYSDATETIMEOFFSET(), RestoredBy = @Actor WHERE ResetId = @ResetId;

COMMIT;

SELECT @ResetId AS ResetId;
