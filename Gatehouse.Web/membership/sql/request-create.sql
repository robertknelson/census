-- A visitor asks to join (gatehouse.md §11.2), with its audit row, in one transaction. The identifier and Windows
-- identity are the signed-in ones, never the body's. The role must be in member-types; every application must be in
-- the registry and not retired. THROW 50409: already a member, or a request already waits; 50400: a choice that is
-- not on offer. Returns the request's Id.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM membership.Member WHERE Identifier = @Identifier OR WindowsIdentity = @WindowsIdentity)
    THROW 50409, 'You are already a member; sign in again to see your roles.', 1;
IF EXISTS (SELECT 1 FROM membership.MembershipRequest WITH (UPDLOCK, HOLDLOCK) WHERE Identifier = @Identifier AND Status = 'pending')
    THROW 50409, 'Your request is already waiting for an administrator.', 1;
IF NOT EXISTS (SELECT 1 FROM core.SelectItem x JOIN core.SelectItem h ON h.Id = x.MasterId AND h.MasterId = -1 AND h.Identifier = 'member-types' WHERE x.Id = @RoleId)
    THROW 50400, 'That role is not one on offer.', 1;
IF EXISTS (SELECT 1 FROM OPENJSON(@ApplicationIds) j
           LEFT JOIN membership.Application a ON a.Id = TRY_CAST(j.value AS int) AND a.Disposition <> 'retired'
           WHERE a.Id IS NULL)
    THROW 50400, 'One of those applications is not on offer.', 1;

INSERT membership.MembershipRequest (Identifier, WindowsIdentity, FirstName, LastName, Email, Reason, RoleId, ApplicationIds, Status)
VALUES (@Identifier, @WindowsIdentity, @FirstName, @LastName, @Email, @Reason, @RoleId, @ApplicationIds, 'pending');
DECLARE @id int = CAST(SCOPE_IDENTITY() AS int);

DECLARE @new nvarchar(max) = (SELECT MembershipRequestId, Identifier, WindowsIdentity, FirstName, LastName, Email, Reason, RoleId,
                                     JSON_QUERY(ApplicationIds) AS ApplicationIds, Status
                              FROM membership.MembershipRequest WHERE MembershipRequestId = @id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy)
VALUES ('request', CAST(@id AS nvarchar(100)), 'requested', NULL, @new, @Identifier);

COMMIT;
SELECT @id AS [key] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
