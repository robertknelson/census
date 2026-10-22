-- Every correction made from the curate pages (personas.md §6.3): the row before and after as JSON
-- (the PreviousValue / NewValue pattern), who, and when. A delete keeps the whole row — and for a
-- release, everything under it — so nothing corrected away is lost. Census's own schema.
-- Idempotent. SQL Server 2019.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('moveit.EditAudit', 'U') IS NULL
BEGIN
    CREATE TABLE moveit.EditAudit (
        EditAuditId   bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_EditAudit PRIMARY KEY,
        Entity        varchar(30)    NOT NULL,   -- release | workitem | build | event | link
        EntityId      int            NOT NULL,
        ReleaseId     int            NULL,       -- the release it belongs to, for a release's history
        Action        varchar(30)    NOT NULL,   -- created | updated | deleted
        PreviousValue nvarchar(max)  NULL,
        NewValue      nvarchar(max)  NULL,
        ChangedBy     nvarchar(100)  NOT NULL,
        ChangedAt     datetimeoffset NOT NULL CONSTRAINT DF_EditAudit_ChangedAt DEFAULT (SYSDATETIMEOFFSET())
    );

    CREATE INDEX IX_EditAudit_Entity ON moveit.EditAudit (Entity, EntityId, ChangedAt);
    CREATE INDEX IX_EditAudit_Release ON moveit.EditAudit (ReleaseId, ChangedAt);
END
