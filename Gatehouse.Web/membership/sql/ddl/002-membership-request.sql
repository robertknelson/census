-- The visitor welcome's requests to join (gatehouse.md §11.3, V1 ratified 2026-10-24): who asked, why, for which
-- applications and role, and what was decided. Kept, never deleted: a decided request is the record of who asked for
-- what and who said yes. One pending request per identifier.
-- New DDL in AppTrak's membership schema. Idempotent. SQL Server 2019.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('membership.MembershipRequest', 'U') IS NULL
BEGIN
    CREATE TABLE membership.MembershipRequest (
        MembershipRequestId int IDENTITY(1,1) NOT NULL CONSTRAINT PK_MembershipRequest PRIMARY KEY,
        Identifier      nvarchar(100)  NOT NULL,   -- USERNAME, as membership.Member.Identifier
        WindowsIdentity nvarchar(72)   NOT NULL,   -- DOMAIN\USERNAME, as signed in
        FirstName       nvarchar(100)  NOT NULL,
        LastName        nvarchar(100)  NOT NULL,
        Email           nvarchar(100)  NOT NULL,
        Reason          nvarchar(1000) NOT NULL,
        RoleId          int            NOT NULL,   -- core.SelectItem, member-types
        ApplicationIds  nvarchar(max)  NOT NULL,   -- JSON array of membership.Application Ids
        Status          varchar(20)    NOT NULL,   -- pending | approved | declined
        RequestedAt     datetimeoffset NOT NULL CONSTRAINT DF_MembershipRequest_RequestedAt DEFAULT (SYSDATETIMEOFFSET()),
        DecidedBy       nvarchar(100)  NULL,
        DecidedAt       datetimeoffset NULL,
        DecisionNote    nvarchar(1000) NULL
    );

    CREATE UNIQUE INDEX UX_MembershipRequest_Pending ON membership.MembershipRequest (Identifier) WHERE Status = 'pending';
END
