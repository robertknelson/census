-- =============================================================================
-- The log tables, indexed for Log Explorer and Trace
-- Date:    2026-10-23
-- Spec:    .docs/features/log-explorer-and-trace.md §7
--
-- xf-dashboard's run book 36 (2026-10-20-log-indexes.sql) without its
-- ActivityEvent index and without the CorrelationId column (the target's
-- log.Exception has it), plus the two window indexes Log Explorer opens on:
-- today, across every identifier.
--
-- The log tables have their primary keys only and are kept forever, so every
-- lookup without these scans an ever-growing table.
--
-- Run against the database that holds the log schema. Safe to re-run: each index
-- is created only if absent. ONLINE where the edition allows it (Enterprise,
-- Developer, Azure), so the tables stay writable while a large one is indexed.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;

DECLARE @online nvarchar(20) =
    CASE WHEN CAST(SERVERPROPERTY('EngineEdition') AS int) IN (3, 5, 8) THEN N' WITH (ONLINE = ON)' ELSE N'' END;

DECLARE @wanted TABLE (TableName sysname, IndexName sysname, Columns nvarchar(200), Includes nvarchar(200) NULL);
INSERT @wanted VALUES
    (N'log.ApiRequest', N'IX_ApiRequest_StartAt',            N'StartAt',             N'Identifier, Application, Stage, HttpMethod, HttpStatus, Elapsed'),
    (N'log.ApiRequest', N'IX_ApiRequest_SessionId_StartAt',  N'SessionId, StartAt',  N'Identifier, Path, HttpMethod, HttpStatus, Elapsed, CorrelationId'),
    (N'log.ApiRequest', N'IX_ApiRequest_Identifier_StartAt', N'Identifier, StartAt', N'SessionId, Path, HttpStatus'),
    (N'log.ApiRequest', N'IX_ApiRequest_CorrelationId',      N'CorrelationId',       NULL),
    (N'log.ApiRequest', N'IX_ApiRequest_Uid',                N'Uid',                 NULL),
    (N'log.ApiContent', N'IX_ApiContent_Uid',                N'Uid',                 N'ContentType'),
    (N'log.Exception',  N'IX_Exception_StartAt',             N'StartAt',             N'Level, SessionId'),
    (N'log.Exception',  N'IX_Exception_SessionId_StartAt',   N'SessionId, StartAt',  NULL),
    (N'log.Exception',  N'IX_Exception_CorrelationId',       N'CorrelationId',       NULL),
    (N'log.Message',    N'IX_Message_StartAt',               N'StartAt',             N'Level, SessionId'),
    (N'log.Message',    N'IX_Message_SessionId_StartAt',     N'SessionId, StartAt',  NULL),
    (N'log.Message',    N'IX_Message_CorrelationId',         N'CorrelationId',       NULL),
    (N'log.Session',    N'IX_Session_Identifier_StartAt',    N'Identifier, StartAt', N'SessionId'),
    (N'log.Session',    N'IX_Session_SessionId',             N'SessionId',           NULL);

DECLARE @table sysname, @index sysname, @columns nvarchar(200), @includes nvarchar(200), @sql nvarchar(max);
DECLARE wanted CURSOR LOCAL FAST_FORWARD FOR SELECT TableName, IndexName, Columns, Includes FROM @wanted;
OPEN wanted;
FETCH NEXT FROM wanted INTO @table, @index, @columns, @includes;
WHILE @@FETCH_STATUS = 0
BEGIN
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
