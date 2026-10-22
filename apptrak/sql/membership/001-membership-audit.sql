-- The membership page's history (personas.md §6.2): every write the page makes to membership,
-- with the row before and after as JSON (the PreviousValue / NewValue pattern), who, and when.
-- New DDL in AppTrak's membership schema: Robert's ratification before the real server sees it.
-- Idempotent. SQL Server 2019 (no JSON_OBJECT).

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('membership.MembershipAudit', 'U') IS NULL
BEGIN
    CREATE TABLE membership.MembershipAudit (
        MembershipAuditId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_MembershipAudit PRIMARY KEY,
        Entity            varchar(30)    NOT NULL,   -- application | member | grant
        EntityKey         nvarchar(100)  NOT NULL,   -- Id, or MemberId:ApplicationId:RoleId for a grant
        Action            varchar(30)    NOT NULL,   -- created | updated | granted | revoked
        PreviousValue     nvarchar(max)  NULL,
        NewValue          nvarchar(max)  NULL,
        ChangedBy         nvarchar(100)  NOT NULL,
        ChangedAt         datetimeoffset NOT NULL CONSTRAINT DF_MembershipAudit_ChangedAt DEFAULT (SYSDATETIMEOFFSET())
    );

    CREATE INDEX IX_MembershipAudit_Entity ON membership.MembershipAudit (Entity, EntityKey, ChangedAt);
END
