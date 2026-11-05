-- The reset (census-on-apptrak.md §5, D-003): one call wipes every asserted row, and keeps each one as
-- JSON so the wipe can be undone. reset.AssertedTable is the one list of what a reset wipes; a table
-- that holds what people told us (not what was observed) is added here in the commit that creates it.
-- Idempotent. SQL Server 2019.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF SCHEMA_ID('reset') IS NULL EXEC ('CREATE SCHEMA reset');

IF OBJECT_ID('reset.AssertedTable', 'U') IS NULL
BEGIN
    CREATE TABLE reset.AssertedTable (
        TableName  sysname        NOT NULL CONSTRAINT PK_AssertedTable PRIMARY KEY,   -- schema.table
        WipeOrder  int            NOT NULL,   -- wiped low to high, restored high to low
        Note       nvarchar(200)  NULL
    );
END;

IF OBJECT_ID('reset.Reset', 'U') IS NULL
BEGIN
    CREATE TABLE reset.Reset (
        ResetId     int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Reset PRIMARY KEY,
        At          datetimeoffset NOT NULL CONSTRAINT DF_Reset_At DEFAULT (SYSDATETIMEOFFSET()),
        [By]        nvarchar(100)  NOT NULL,
        Reason      nvarchar(500)  NOT NULL,
        RestoredAt  datetimeoffset NULL,
        RestoredBy  nvarchar(100)  NULL
    );
END;

IF OBJECT_ID('reset.Snapshot', 'U') IS NULL
BEGIN
    CREATE TABLE reset.Snapshot (
        ResetId    int            NOT NULL CONSTRAINT FK_Snapshot_Reset REFERENCES reset.Reset (ResetId),
        TableName  sysname        NOT NULL,
        RowsTaken  int            NOT NULL,
        RowsJson   nvarchar(max)  NULL,       -- FOR JSON PATH, INCLUDE_NULL_VALUES; NULL when the table was empty
        CONSTRAINT PK_Snapshot PRIMARY KEY (ResetId, TableName)
    );
END;

MERGE reset.AssertedTable AS t
USING (VALUES
    ('moveit.WorkItemLink', 10, N'Move It: dependencies between items'),
    ('moveit.ReleaseEvent', 20, N'Move It: approvals, holds, notes'),
    ('moveit.ReleaseBuild', 30, N'Move It: which builds carry a release'),
    ('moveit.WorkItem',     40, N'Move It: features and fixes'),
    ('moveit.Release',      50, N'Move It: releases'),
    ('moveit.EditAudit',    60, N'Move It: the history of corrections to the rows above')
) AS s (TableName, WipeOrder, Note)
ON t.TableName = s.TableName
WHEN NOT MATCHED THEN INSERT (TableName, WipeOrder, Note) VALUES (s.TableName, s.WipeOrder, s.Note);
