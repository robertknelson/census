-- Delete one member from the membership page, audited with their grants, in one transaction; their
-- grants go with them. THROW 50404: gone.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @prev nvarchar(max) = (
    SELECT m.Id, m.Identifier, m.WindowsIdentity, m.FirstName, m.LastName, m.Email,
           (SELECT g.ApplicationId, g.RoleId FROM membership.MemberApplicationRole g WHERE g.MemberId = m.Id FOR JSON PATH) AS Grants
    FROM membership.Member m WHERE m.Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
IF @prev IS NULL THROW 50404, 'That member no longer exists.', 1;

DELETE FROM membership.MemberApplicationRole WHERE MemberId = @Id;
DELETE FROM membership.Member WHERE Id = @Id;

INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy)
VALUES ('member', CAST(@Id AS nvarchar(100)), 'deleted', @prev, NULL, @Actor);

COMMIT;
SELECT @Id AS [key] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
