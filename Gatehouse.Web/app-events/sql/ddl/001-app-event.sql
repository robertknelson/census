-- AppEvent: one row per step of a unit of business work, from any system (gatehouse.md §12.2, app-event.md D1–D11).
-- Run on the database that holds the log tables (the "logs" connection; in the live app, AppTrak), with sqlcmd's
-- -v Schema=<the log tables' schema> (required; Logs:Schema, apptrak unless the live sink writes elsewhere, e.g. log).
-- Idempotent:
--   * where <Schema>.AppEvent is missing (the local demo) it is created in the shape the real one already has;
--   * the columns AE-R2 allows (WorkUid, ParentUid, SubjectType, SubjectKey, Message) are added where missing;
--   * the indexes of app-event.md §6 are created where missing.
-- The unique index on Uid skips empty Uids: a sink that does not fill the Uid would otherwise fail on every second
-- event, and the live sink swallows that failure (gatehouse.md §12.2). On Standard edition each new index locks the
-- table while it builds; the table is empty until something writes it (AE-R2), so build them before it is used.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;

IF SCHEMA_ID(N'$(Schema)') IS NULL EXEC (N'CREATE SCHEMA [$(Schema)]');

IF OBJECT_ID(N'[$(Schema)].AppEvent', N'U') IS NULL
    CREATE TABLE [$(Schema)].AppEvent (
        Id              bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_AppEvent PRIMARY KEY,
        Uid             nvarchar(36)   NOT NULL CONSTRAINT DF_AppEvent_Uid DEFAULT (NEWID()),
        Identifier      nvarchar(50)   NOT NULL,
        Path            nvarchar(255)  NOT NULL CONSTRAINT DF_AppEvent_Path DEFAULT (' '),
        SessionId       nvarchar(50)   NOT NULL,
        CorrelationId   nvarchar(50)   NOT NULL,
        Machine         nvarchar(25)   NOT NULL,
        Stage           nvarchar(15)   NOT NULL,
        Application     nvarchar(50)   NOT NULL,
        StartAt         datetimeoffset NOT NULL,
        Namespace       nvarchar(50)   NOT NULL,
        CommandName     nvarchar(50)   NOT NULL,
        CommandActivity nvarchar(50)   NOT NULL,
        Body            nvarchar(max)  NOT NULL,
        Data            nvarchar(max)  NOT NULL,
        CreatedAt       datetimeoffset NOT NULL CONSTRAINT DF_AppEvent_CreatedAt DEFAULT (SYSDATETIMEOFFSET()),
        IsFromApi       bit            NOT NULL CONSTRAINT DF_AppEvent_IsFromApi DEFAULT (0),
        ExecuteOn AS (CONVERT(date, StartAt)),
        ExecuteAt AS (CONVERT(time(0), StartAt))
    );

IF COL_LENGTH(N'[$(Schema)].AppEvent', N'WorkUid') IS NULL     ALTER TABLE [$(Schema)].AppEvent ADD WorkUid nvarchar(36) NULL;
IF COL_LENGTH(N'[$(Schema)].AppEvent', N'ParentUid') IS NULL   ALTER TABLE [$(Schema)].AppEvent ADD ParentUid nvarchar(36) NULL;
IF COL_LENGTH(N'[$(Schema)].AppEvent', N'SubjectType') IS NULL ALTER TABLE [$(Schema)].AppEvent ADD SubjectType nvarchar(50) NULL;
IF COL_LENGTH(N'[$(Schema)].AppEvent', N'SubjectKey') IS NULL  ALTER TABLE [$(Schema)].AppEvent ADD SubjectKey nvarchar(100) NULL;
IF COL_LENGTH(N'[$(Schema)].AppEvent', N'Message') IS NULL     ALTER TABLE [$(Schema)].AppEvent ADD Message nvarchar(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[$(Schema)].AppEvent') AND name = N'UX_AppEvent_Uid')
    CREATE UNIQUE INDEX UX_AppEvent_Uid ON [$(Schema)].AppEvent (Uid) WHERE Uid <> N'';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[$(Schema)].AppEvent') AND name = N'IX_AppEvent_StartAt')
    CREATE INDEX IX_AppEvent_StartAt ON [$(Schema)].AppEvent (StartAt);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[$(Schema)].AppEvent') AND name = N'IX_AppEvent_WorkUid')
    CREATE INDEX IX_AppEvent_WorkUid ON [$(Schema)].AppEvent (WorkUid, StartAt) WHERE WorkUid IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[$(Schema)].AppEvent') AND name = N'IX_AppEvent_Kind')
    CREATE INDEX IX_AppEvent_Kind ON [$(Schema)].AppEvent (Namespace, CommandName, StartAt) INCLUDE (CommandActivity, Application, Stage);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[$(Schema)].AppEvent') AND name = N'IX_AppEvent_Identifier')
    CREATE INDEX IX_AppEvent_Identifier ON [$(Schema)].AppEvent (Identifier, StartAt);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[$(Schema)].AppEvent') AND name = N'IX_AppEvent_Session')
    CREATE INDEX IX_AppEvent_Session ON [$(Schema)].AppEvent (SessionId, StartAt);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[$(Schema)].AppEvent') AND name = N'IX_AppEvent_Subject')
    CREATE INDEX IX_AppEvent_Subject ON [$(Schema)].AppEvent (SubjectType, SubjectKey, StartAt) WHERE SubjectType IS NOT NULL;
