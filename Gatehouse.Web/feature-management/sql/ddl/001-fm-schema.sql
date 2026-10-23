-- Copied from FM2280 (via Census apptrak/sql/fm) for Gatehouse's own fm (gatehouse.md §8, G-R9). Unchanged.
-- FM2280 feature access schema. Idempotent. Must run on SQL Server 2019.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF SCHEMA_ID('fm') IS NULL
    EXEC('CREATE SCHEMA fm');
GO

IF OBJECT_ID('fm.Feature', 'U') IS NULL
BEGIN
    CREATE TABLE fm.Feature (
        FeatureId     int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Feature PRIMARY KEY,
        Name          varchar(100)   NOT NULL,
        DisplayName   nvarchar(150)  NOT NULL,
        Description   nvarchar(1000) NULL,
        IsEnabled     bit NOT NULL CONSTRAINT DF_Feature_IsEnabled DEFAULT (0),
        IsVoided      bit NOT NULL CONSTRAINT DF_Feature_IsVoided DEFAULT (0),
        VoidedBy      nvarchar(100)  NULL,
        VoidedAt      datetime2(3)   NULL,
        VoidReason    nvarchar(500)  NULL,
        CreatedBy     nvarchar(100)  NOT NULL,
        CreatedAt     datetime2(3)   NOT NULL CONSTRAINT DF_Feature_CreatedAt DEFAULT (SYSUTCDATETIME()),
        ModifiedBy    nvarchar(100)  NULL,
        ModifiedAt    datetime2(3)   NULL,
        RowVersion    rowversion     NOT NULL
    );

    CREATE UNIQUE INDEX UX_Feature_Name ON fm.Feature (Name) WHERE IsVoided = 0;
END
GO

IF OBJECT_ID('fm.FeatureRole', 'U') IS NULL
BEGIN
    CREATE TABLE fm.FeatureRole (
        FeatureId  int          NOT NULL CONSTRAINT FK_FeatureRole_Feature REFERENCES fm.Feature (FeatureId),
        RoleName   varchar(100) NOT NULL,
        GrantedBy  nvarchar(100) NOT NULL,
        GrantedAt  datetime2(3) NOT NULL CONSTRAINT DF_FeatureRole_GrantedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_FeatureRole PRIMARY KEY (FeatureId, RoleName)
    );
END
GO

IF OBJECT_ID('fm.FeatureAudit', 'U') IS NULL
BEGIN
    CREATE TABLE fm.FeatureAudit (
        FeatureAuditId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_FeatureAudit PRIMARY KEY,
        FeatureId      int           NOT NULL,
        Action         varchar(40)   NOT NULL,
        PreviousValue  nvarchar(max) NULL,
        NewValue       nvarchar(max) NULL,
        ChangedBy      nvarchar(100) NOT NULL,
        ChangedAt      datetime2(3)  NOT NULL CONSTRAINT DF_FeatureAudit_ChangedAt DEFAULT (SYSUTCDATETIME())
    );

    CREATE INDEX IX_FeatureAudit_FeatureId ON fm.FeatureAudit (FeatureId, ChangedAt);
END
GO

-- The one JSON shape of a feature: returned by every command and query, and stored in FeatureAudit.
-- Datetimes are UTC with a 'Z' suffix; rowVersion is a bigint string so JavaScript keeps full precision.
CREATE OR ALTER FUNCTION fm.FeatureSnapshot (@FeatureId int)
RETURNS nvarchar(max)
AS
BEGIN
    RETURN (
        SELECT
            f.FeatureId AS featureId,
            f.Name AS name,
            f.DisplayName AS displayName,
            f.Description AS description,
            f.IsEnabled AS isEnabled,
            f.IsVoided AS isVoided,
            f.VoidedBy AS voidedBy,
            CONVERT(varchar(30), f.VoidedAt, 127) + 'Z' AS voidedAt,
            f.VoidReason AS voidReason,
            f.CreatedBy AS createdBy,
            CONVERT(varchar(30), f.CreatedAt, 127) + 'Z' AS createdAt,
            f.ModifiedBy AS modifiedBy,
            CONVERT(varchar(30), f.ModifiedAt, 127) + 'Z' AS modifiedAt,
            CONVERT(varchar(20), CONVERT(bigint, f.RowVersion)) AS rowVersion,
            JSON_QUERY(COALESCE((
                SELECT
                    fr.RoleName AS roleName,
                    fr.GrantedBy AS grantedBy,
                    CONVERT(varchar(30), fr.GrantedAt, 127) + 'Z' AS grantedAt
                FROM fm.FeatureRole fr
                WHERE fr.FeatureId = f.FeatureId
                ORDER BY fr.RoleName
                FOR JSON PATH), '[]')) AS roles
        FROM fm.Feature f
        WHERE f.FeatureId = @FeatureId
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
    );
END
GO
