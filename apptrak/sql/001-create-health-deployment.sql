-- health.Deployment: the transit ledger. One row per observed change of the deployment
-- tuple at an endpoint (move-it.md 10.1). Observed evidence, so it lives in `health`
-- beside HealthReport, not in `moveit`.
--
-- Written by the HealthReport processor on change (Robert's code, not in this repo) and by
-- backfill-health-deployment.sql over history. Both apply the same rule.
--
-- Idempotent: safe to re-run.

IF OBJECT_ID('health.Deployment', 'U') IS NULL
BEGIN
    CREATE TABLE health.Deployment (
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
        HealthReportId  bigint          NOT NULL,   -- the raw evidence row
        PreviousId      bigint          NULL,       -- prior row for this endpoint
        SupersededAt    datetimeoffset  NULL,       -- set when the next row lands
        CreatedAt       datetimeoffset  NOT NULL CONSTRAINT DF_Deployment_CreatedAt DEFAULT (sysdatetimeoffset()),
        CONSTRAINT PK_Deployment PRIMARY KEY CLUSTERED (Id)
    );

    CREATE INDEX IX_Deployment_Endpoint ON health.Deployment (EndpointId, DetectedAt DESC);
    CREATE UNIQUE INDEX UX_Deployment_HealthReport ON health.Deployment (HealthReportId);
END;
