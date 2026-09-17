-- moveit: the assertions (move-it.md 10.2). Six tables counting moveit.Deployment; five
-- lookup groupings in core.SelectItem (003-lookups.sql); everything else derived by query.
-- Records what is *in a build*, never what people are *doing*.
--
-- No foreign keys, matching the rest of AppTrak. Idempotent: safe to re-run.

IF SCHEMA_ID('moveit') IS NULL
    EXEC ('CREATE SCHEMA moveit AUTHORIZATION dbo');
GO

IF OBJECT_ID('moveit.Release', 'U') IS NULL
BEGIN
    CREATE TABLE moveit.Release (
        Id            int IDENTITY   NOT NULL,
        ApplicationId int            NOT NULL,
        Name          nvarchar(100)  NOT NULL,   -- "Sprint 42", "Q3 mortgage changes"
        Kind          nvarchar(25)   NOT NULL,   -- SelectItem ReleaseKind: featureset | hotfix (asserted intent)
        TargetDate    date           NULL,       -- planned PROD; actual is moveit.Deployment
        Note          nvarchar(max)  NULL,
        CreatedAt     datetimeoffset NOT NULL CONSTRAINT DF_Release_CreatedAt DEFAULT (sysdatetimeoffset()),
        CreatedBy     nvarchar(50)   NOT NULL,
        CONSTRAINT PK_Release PRIMARY KEY CLUSTERED (Id)
    );
    CREATE INDEX IX_Release_Application ON moveit.Release (ApplicationId);
END;

IF OBJECT_ID('moveit.WorkItem', 'U') IS NULL
BEGIN
    CREATE TABLE moveit.WorkItem (
        Id              int IDENTITY   NOT NULL,
        ReleaseId       int            NOT NULL,
        Kind            nvarchar(25)   NOT NULL,   -- SelectItem WorkItemKind: feature | fix
        Title           nvarchar(200)  NOT NULL,
        Description     nvarchar(max)  NULL,
        BuiltBy         nvarchar(50)   NULL,       -- who built it: provenance, never assignment
        ExternalRef     nvarchar(100)  NULL,       -- Team A's task id, verbatim
        IncludedInBuild nvarchar(50)   NULL,       -- first build containing it, verbatim; NULL = with the devs
        FoundInStage    nvarchar(25)   NULL,       -- for fixes: where the defect was found
        RemovedAt       datetimeoffset NULL,       -- pulled from the release
        RemovedNote     nvarchar(255)  NULL,
        CreatedAt       datetimeoffset NOT NULL CONSTRAINT DF_WorkItem_CreatedAt DEFAULT (sysdatetimeoffset()),
        CreatedBy       nvarchar(50)   NOT NULL,
        CONSTRAINT PK_WorkItem PRIMARY KEY CLUSTERED (Id)
    );
    CREATE INDEX IX_WorkItem_Release ON moveit.WorkItem (ReleaseId);
END;

-- Assertion: build B belongs to release R. Needed because a hotfix breaks the single-lineage
-- assumption (a hotfix build lands on PROD while sprint builds keep landing on DEV).
IF OBJECT_ID('moveit.ReleaseBuild', 'U') IS NULL
BEGIN
    CREATE TABLE moveit.ReleaseBuild (
        Id        int IDENTITY   NOT NULL,
        ReleaseId int            NOT NULL,
        Build     nvarchar(50)   NOT NULL,   -- verbatim
        Note      nvarchar(255)  NULL,
        CreatedAt datetimeoffset NOT NULL CONSTRAINT DF_ReleaseBuild_CreatedAt DEFAULT (sysdatetimeoffset()),
        CreatedBy nvarchar(50)   NOT NULL,
        CONSTRAINT PK_ReleaseBuild PRIMARY KEY CLUSTERED (Id),
        CONSTRAINT UQ_ReleaseBuild UNIQUE (ReleaseId, Build)
    );
END;

-- Human events only. Promotion and PROD arrival are observed and live in moveit.Deployment;
-- storing them again would be dual truth.
IF OBJECT_ID('moveit.ReleaseEvent', 'U') IS NULL
BEGIN
    CREATE TABLE moveit.ReleaseEvent (
        Id        int IDENTITY   NOT NULL,
        ReleaseId int            NOT NULL,
        Kind      nvarchar(25)   NOT NULL,   -- SelectItem EventKind
        Stage     nvarchar(25)   NULL,       -- the stage the event speaks about
        Build     nvarchar(50)   NULL,       -- the build it speaks about, verbatim
        At        datetimeoffset NOT NULL,   -- when the humans did it
        [By]      nvarchar(50)   NOT NULL,   -- who did it (the approver, the tester)
        Note      nvarchar(max)  NULL,
        CreatedAt datetimeoffset NOT NULL CONSTRAINT DF_ReleaseEvent_CreatedAt DEFAULT (sysdatetimeoffset()),
        CreatedBy nvarchar(50)   NOT NULL,   -- who recorded it
        CONSTRAINT PK_ReleaseEvent PRIMARY KEY CLUSTERED (Id)
    );
    CREATE INDEX IX_ReleaseEvent_Release ON moveit.ReleaseEvent (ReleaseId, At);
END;

-- Directed, feature-level dependency. A coordinated release is whatever set of releases is
-- connected by these; it is never stored.
IF OBJECT_ID('moveit.WorkItemLink', 'U') IS NULL
BEGIN
    CREATE TABLE moveit.WorkItemLink (
        Id               int IDENTITY   NOT NULL,
        WorkItemId       int            NOT NULL,   -- the dependent side
        LinkedWorkItemId int            NOT NULL,   -- the thing it needs
        Kind             nvarchar(25)   NOT NULL,   -- SelectItem LinkKind: dependsOn | relatedTo
        Note             nvarchar(255)  NULL,
        CreatedAt        datetimeoffset NOT NULL CONSTRAINT DF_WorkItemLink_CreatedAt DEFAULT (sysdatetimeoffset()),
        CreatedBy        nvarchar(50)   NOT NULL,
        CONSTRAINT PK_WorkItemLink PRIMARY KEY CLUSTERED (Id),
        CONSTRAINT UQ_WorkItemLink UNIQUE (WorkItemId, LinkedWorkItemId, Kind)
    );
END;
