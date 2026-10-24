-- An administrator decides a request to join (gatehouse.md §11.4), in one transaction, audited.
--   @Approve = 1: create the member from the request and grant @RoleId on each of @ApplicationIds (the approver may
--                 change the role or drop applications); mark it approved. Refused when a member with that identifier
--                 or Windows identity now exists.
--   @Approve = 0: mark it declined with @Note, which the visitor sees.
-- THROW 50404: no such request; 50409: decided already, or already a member; 50400: a choice not on offer.
-- Returns the request's Id and, approved, the new member's.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @prev nvarchar(max) = (SELECT MembershipRequestId, Identifier, WindowsIdentity, FirstName, LastName, Email, Reason, RoleId,
                                      JSON_QUERY(ApplicationIds) AS ApplicationIds, Status
                               FROM membership.MembershipRequest WITH (UPDLOCK, HOLDLOCK) WHERE MembershipRequestId = @Id
                               FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
IF @prev IS NULL THROW 50404, 'That request no longer exists.', 1;
IF JSON_VALUE(@prev, '$.Status') <> 'pending' THROW 50409, 'That request has been decided already.', 1;

DECLARE @member int = NULL;
IF @Approve = 1
BEGIN
    IF EXISTS (SELECT 1 FROM membership.Member m JOIN membership.MembershipRequest q ON q.MembershipRequestId = @Id
               WHERE m.Identifier = q.Identifier OR m.WindowsIdentity = q.WindowsIdentity)
        THROW 50409, 'A member with that identifier or Windows identity exists now; grant the roles on their page instead.', 1;
    IF NOT EXISTS (SELECT 1 FROM core.SelectItem x JOIN core.SelectItem h ON h.Id = x.MasterId AND h.MasterId = -1 AND h.Identifier = 'member-types' WHERE x.Id = @RoleId)
        THROW 50400, 'That role is not in member-types.', 1;
    IF NOT EXISTS (SELECT 1 FROM OPENJSON(@ApplicationIds))
        THROW 50400, 'Approve at least one application.', 1;
    IF EXISTS (SELECT 1 FROM OPENJSON(@ApplicationIds) j LEFT JOIN membership.Application a ON a.Id = TRY_CAST(j.value AS int) WHERE a.Id IS NULL)
        THROW 50400, 'One of those applications no longer exists.', 1;

    INSERT membership.Member (Identifier, WindowsIdentity, FirstName, LastName, Email, CreatedAt)
    SELECT Identifier, WindowsIdentity, FirstName, LastName, Email, SYSDATETIMEOFFSET()
    FROM membership.MembershipRequest WHERE MembershipRequestId = @Id;
    SET @member = CAST(SCOPE_IDENTITY() AS int);

    INSERT membership.MemberApplicationRole (MemberId, ApplicationId, RoleId)
    SELECT DISTINCT @member, TRY_CAST(j.value AS int), @RoleId FROM OPENJSON(@ApplicationIds) j;

    INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy)
    VALUES ('member', CAST(@member AS nvarchar(100)), 'created', NULL,
            (SELECT Id, Identifier, WindowsIdentity, FirstName, LastName, Email FROM membership.Member WHERE Id = @member FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            @Actor);
    INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy)
    SELECT 'grant', CONCAT(g.MemberId, ':', g.ApplicationId, ':', g.RoleId), 'granted', NULL,
           (SELECT g.MemberId AS MemberId, m.Identifier AS Member, g.ApplicationId AS ApplicationId, a.Identifier AS Application,
                   g.RoleId AS RoleId, r.Identifier AS Role
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           @Actor
    FROM membership.MemberApplicationRole g
    JOIN membership.Member m ON m.Id = g.MemberId
    JOIN membership.Application a ON a.Id = g.ApplicationId
    JOIN core.SelectItem r ON r.Id = g.RoleId
    WHERE g.MemberId = @member;

    UPDATE membership.MembershipRequest
    SET Status = 'approved', DecidedBy = @Actor, DecidedAt = SYSDATETIMEOFFSET(), DecisionNote = @Note
    WHERE MembershipRequestId = @Id;
END
ELSE
BEGIN
    IF @Note IS NULL THROW 50400, 'Say why, so the visitor knows.', 1;
    UPDATE membership.MembershipRequest
    SET Status = 'declined', DecidedBy = @Actor, DecidedAt = SYSDATETIMEOFFSET(), DecisionNote = @Note
    WHERE MembershipRequestId = @Id;
END

INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy)
VALUES ('request', CAST(@Id AS nvarchar(100)), CASE WHEN @Approve = 1 THEN 'approved' ELSE 'declined' END, @prev,
        (SELECT MembershipRequestId, Identifier, Status, DecidedBy, DecisionNote, @RoleId AS RoleId,
                JSON_QUERY(@ApplicationIds) AS ApplicationIds, @member AS MemberId
         FROM membership.MembershipRequest WHERE MembershipRequestId = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        @Actor);

COMMIT;
SELECT @Id AS [key], @member AS memberId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
