-- The reset (census-on-apptrak.md §5, D-003): every row of every table in reset.AssertedTable is kept
-- as JSON in reset.Snapshot, then deleted, in one transaction. Observed data and identity are never
-- listed there, so never touched. Returns the new ResetId.
-- Refuses (50410) unless this database is armed (002-arm-reset.sql). Parameters: @Actor, @Reason.

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties
               WHERE class = 0 AND name = N'AllowAssertionReset' AND CAST(value AS nvarchar(10)) = N'1')
    THROW 50410, 'This database is not armed for a reset. Run apptrak/sql/reset/002-arm-reset.sql on it by hand, and never on production.', 1;

IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL
    THROW 50400, 'A reset needs a reason.', 1;

BEGIN TRANSACTION;

INSERT reset.Reset ([By], Reason) VALUES (@Actor, @Reason);
DECLARE @resetId int = SCOPE_IDENTITY();

DECLARE @t sysname, @q nvarchar(300), @json nvarchar(max), @n int, @sql nvarchar(max);
DECLARE tables CURSOR LOCAL FAST_FORWARD FOR
    SELECT TableName FROM reset.AssertedTable WHERE OBJECT_ID(TableName, 'U') IS NOT NULL ORDER BY WipeOrder;
OPEN tables;
FETCH NEXT FROM tables INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @q = QUOTENAME(PARSENAME(@t, 2)) + N'.' + QUOTENAME(PARSENAME(@t, 1));
    SET @sql = N'SELECT @n = COUNT(*) FROM ' + @q + N' WITH (TABLOCKX, HOLDLOCK);'
             + N' SET @json = (SELECT * FROM ' + @q + N' FOR JSON PATH, INCLUDE_NULL_VALUES);'
             + N' DELETE FROM ' + @q + N';';
    EXEC sys.sp_executesql @sql, N'@n int OUTPUT, @json nvarchar(max) OUTPUT', @n = @n OUTPUT, @json = @json OUTPUT;
    INSERT reset.Snapshot (ResetId, TableName, RowsTaken, RowsJson) VALUES (@resetId, @t, @n, @json);
    FETCH NEXT FROM tables INTO @t;
END;
CLOSE tables;
DEALLOCATE tables;

COMMIT;

SELECT @resetId AS ResetId;
