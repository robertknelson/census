-- moveit.Deployment: the transit ledger. One row per observed change of the deployment
-- tuple at an endpoint (move-it.md 10.1). Derived from HealthReport, owned by Move It, so
-- it lives in `moveit` (Robert's call, 2026-09-17; it began life in `health`).
--
-- Written by the HealthReport processor on change (Robert's code, not in this repo) and by
-- backfill-deployment.sql over history. Both apply the same rule.
--
-- Idempotent: safe to re-run.

IF SCHEMA_ID('moveit') IS NULL
    EXEC ('CREATE SCHEMA moveit AUTHORIZATION dbo');
GO

IF OBJECT_ID('moveit.Deployment', 'U') IS NULL
BEGIN
    CREATE TABLE moveit.Deployment (
        Id              bigint IDENTITY NOT NULL,
        Uid             nvarchar(36)    NOT NULL CONSTRAINT DF_Deployment_Uid DEFAULT (newid()),
        ApplicationId   int             NOT NULL,
        EndpointId      int             NOT NULL,
        Application     nvarchar(50)    NOT NULL,   -- as reported
        ReportedStage   nvarchar(25)    NOT NULL,   -- payload's claim; registration stage via EndpointId
        Machine         nvarchar(50)    NOT NULL,   -- as reported
        Project         nvarchar(50)    NULL,       -- verbatim, never interpreted
        Version         nvarchar(25)    NOT NULL,
        Build           nvarchar(50)    NOT NULL,
        BuildId         nvarchar(50)    NULL,
        SourceVersion   nvarchar(50)    NULL,
        Branch          nvarchar(50)    NULL,
        Deploymentat    datetimeoffset  NOT NULL,   -- pipeline's claim
        DetectedAt      datetimeoffset  NOT NULL,   -- StartAt of the detecting ping
        ReportId        bigint          NOT NULL,   -- the raw evidence row: health.HealthReport.Id
        PreviousId      bigint          NULL,       -- prior row for this endpoint
        SupersededAt    datetimeoffset  NULL,       -- set when the next row lands
        CreatedAt       datetimeoffset  NOT NULL CONSTRAINT DF_Deployment_CreatedAt DEFAULT (sysdatetimeoffset()),
        CONSTRAINT PK_Deployment PRIMARY KEY CLUSTERED (Id)
    );

    CREATE INDEX IX_Deployment_Endpoint ON moveit.Deployment (EndpointId, DetectedAt DESC);
    CREATE UNIQUE INDEX UX_Deployment_HealthReport ON moveit.Deployment (ReportId);
END;
GO

-- Renamed HealthReportId -> ReportId (Robert, 2026-10-01). A table made before the rename
-- is renamed in place; the unique index follows the column.
IF COL_LENGTH('moveit.Deployment', 'HealthReportId') IS NOT NULL AND COL_LENGTH('moveit.Deployment', 'ReportId') IS NULL
    EXEC sp_rename 'moveit.Deployment.HealthReportId', 'ReportId', 'COLUMN';
GO

-- One row per backfill run (move-it.md §21): how far the ledger has looked. The ledger stores
-- changes only, so without this a quiet week and an un-run backfill look the same.
IF OBJECT_ID('moveit.BackfillRun', 'U') IS NULL
BEGIN
    CREATE TABLE moveit.BackfillRun (
        Id         int IDENTITY   NOT NULL,
        RanAt      datetimeoffset NOT NULL CONSTRAINT DF_BackfillRun_RanAt DEFAULT (sysdatetimeoffset()),
        RanBy      nvarchar(128)  NOT NULL CONSTRAINT DF_BackfillRun_RanBy DEFAULT (suser_sname()),
        ThroughAt  datetimeoffset NULL,       -- StartAt of the latest ping the run considered
        Inserted   int            NOT NULL,
        CONSTRAINT PK_BackfillRun PRIMARY KEY CLUSTERED (Id)
    );
END;
