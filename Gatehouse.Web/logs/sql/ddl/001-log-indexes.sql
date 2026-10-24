-- =============================================================================
-- The log tables, indexed for Log Explorer and Trace
-- Date:    2026-10-23
-- Spec:    .docs/features/log-explorer-and-trace.md §7
--
-- xf-dashboard's run book 36 (2026-10-20-log-indexes.sql) without its
-- ActivityEvent index and without the CorrelationId column (the target's
-- Exception table has it), plus the two window indexes Log Explorer opens on:
-- today, across every identifier; and one for Usage, an application over a period
-- (usage.md §6).
--
-- The log tables have their primary keys only and are kept forever, so every
-- lookup without these scans an ever-growing table. Each index carries only what it must: every
-- column it holds is written again for every logged request, forever (2026-10-23).
--
-- Run against the database that holds the log tables (the real AppTrak), with @schema
-- set to their schema (apptrak there; Logs:Schema in Census). Safe to re-run: each index
-- is created only if absent. ONLINE where the edition allows it (Enterprise,
-- Developer, Azure), so the tables stay writable while a large one is indexed.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;

DECLARE @schema sysname = N'apptrak';

DECLARE @online nvarchar(20) =
    CASE WHEN CAST(SERVERPROPERTY('EngineEdition') AS int) IN (3, 5, 8) THEN N' WITH (ONLINE = ON)' ELSE N'' END;

DECLARE @wanted TABLE (TableName sysname, IndexName sysname, Columns nvarchar(200), Includes nvarchar(200) NULL);
INSERT @wanted VALUES
    (N'ApiRequest', N'IX_ApiRequest_StartAt',            N'StartAt',             N'Identifier, Application, Stage, HttpMethod, HttpStatus, Elapsed'),
    -- Usage: the key finds one application's period; only Stage rides along (every Usage read filters on it). The
    -- other columns are fetched from the table for the rows found, so the index stays small on a table kept forever.
    (N'ApiRequest', N'IX_ApiRequest_Application_StartAt', N'Application, StartAt', N'Stage'),
    -- Trace: a session and an identifier's day are found by key and their rows read whole, so no columns ride along.
    (N'ApiRequest', N'IX_ApiRequest_SessionId_StartAt',  N'SessionId, StartAt',  NULL),
    (N'ApiRequest', N'IX_ApiRequest_Identifier_StartAt', N'Identifier, StartAt', NULL),
    (N'ApiRequest', N'IX_ApiRequest_CorrelationId',      N'CorrelationId',       NULL),
    (N'ApiRequest', N'IX_ApiRequest_Uid',                N'Uid',                 NULL),
    (N'ApiContent', N'IX_ApiContent_Uid',                N'Uid',                 N'ContentType'),
    (N'Exception',  N'IX_Exception_StartAt',             N'StartAt',             N'Level, SessionId'),
    (N'Exception',  N'IX_Exception_SessionId_StartAt',   N'SessionId, StartAt',  NULL),
    (N'Exception',  N'IX_Exception_CorrelationId',       N'CorrelationId',       NULL),
    (N'Message',    N'IX_Message_StartAt',               N'StartAt',             N'Level, SessionId'),
    (N'Message',    N'IX_Message_SessionId_StartAt',     N'SessionId, StartAt',  NULL),
    (N'Message',    N'IX_Message_CorrelationId',         N'CorrelationId',       NULL),
    (N'Session',    N'IX_Session_Identifier_StartAt',    N'Identifier, StartAt', N'SessionId'),
    (N'Session',    N'IX_Session_SessionId',             N'SessionId',           NULL);

DECLARE @table sysname, @index sysname, @columns nvarchar(200), @includes nvarchar(200), @sql nvarchar(max);
DECLARE wanted CURSOR LOCAL FAST_FORWARD FOR SELECT TableName, IndexName, Columns, Includes FROM @wanted;
OPEN wanted;
FETCH NEXT FROM wanted INTO @table, @index, @columns, @includes;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @table = QUOTENAME(@schema) + N'.' + QUOTENAME(@table);
    IF OBJECT_ID(@table) IS NULL
        PRINT CONCAT(@table, ' is not in this database; ', @index, ' skipped.');
    ELSE IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(@table) AND name = @index)
    BEGIN
        SET @sql = N'CREATE NONCLUSTERED INDEX ' + QUOTENAME(@index) + N' ON ' + @table + N' (' + @columns + N')'
            + CASE WHEN @includes IS NULL THEN N'' ELSE N' INCLUDE (' + @includes + N')' END + @online + N';';
        PRINT @sql;
        EXEC sys.sp_executesql @sql;
    END
    ELSE
        PRINT CONCAT(@index, ' already there.');
    FETCH NEXT FROM wanted INTO @table, @index, @columns, @includes;
END
CLOSE wanted;
DEALLOCATE wanted;

PRINT '--- Done ---';
