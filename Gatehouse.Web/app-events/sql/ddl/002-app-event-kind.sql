-- The catalog of kinds of work (gatehouse.md §12.3, AE-R3): Namespace (the business area) + CommandName (NOUN-VERB),
-- both kebab-case, declared here so every system calls the same work by the same name. Beside the application
-- registry in AppTrak (the "default" connection), each kind owned by an application. Retired, never deleted: events
-- keep naming it. Every write is audited in membership.MembershipAudit (entity app-event-kind). Idempotent.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID(N'membership.AppEventKind', N'U') IS NULL
BEGIN
    CREATE TABLE membership.AppEventKind (
        AppEventKindId int IDENTITY(1,1) NOT NULL CONSTRAINT PK_AppEventKind PRIMARY KEY,
        Namespace      nvarchar(50)   NOT NULL,
        CommandName    nvarchar(50)   NOT NULL,
        DisplayName    nvarchar(100)  NOT NULL,
        Description    nvarchar(500)  NULL,
        ApplicationId  int            NULL CONSTRAINT FK_AppEventKind_Application REFERENCES membership.Application (Id),
        Disposition    varchar(20)    NOT NULL CONSTRAINT DF_AppEventKind_Disposition DEFAULT ('current'),   -- current | retired
        CreatedAt      datetimeoffset NOT NULL CONSTRAINT DF_AppEventKind_CreatedAt DEFAULT (SYSDATETIMEOFFSET()),
        CreatedBy      nvarchar(100)  NOT NULL
    );

    CREATE UNIQUE INDEX UX_AppEventKind_Name ON membership.AppEventKind (Namespace, CommandName);
END
