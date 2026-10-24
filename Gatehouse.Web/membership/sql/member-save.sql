-- Create (@Id NULL) or update one member from the membership page, with its audit row, in one
-- transaction. Identifier and Windows identity are each unique by this rule (no constraint in the
-- table). THROW 50404: no such member; 50409: identifier or Windows identity taken. Returns the Id.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM membership.Member WHERE Identifier = @Identifier AND (@Id IS NULL OR Id <> @Id))
    THROW 50409, 'Another member already has that identifier.', 1;
IF EXISTS (SELECT 1 FROM membership.Member WHERE WindowsIdentity = @WindowsIdentity AND (@Id IS NULL OR Id <> @Id))
    THROW 50409, 'Another member already has that Windows identity.', 1;

DECLARE @prev nvarchar(max) = NULL;
IF @Id IS NOT NULL
BEGIN
    SET @prev = (SELECT Id, Identifier, WindowsIdentity, FirstName, LastName, Email
                 FROM membership.Member WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    IF @prev IS NULL THROW 50404, 'That member no longer exists.', 1;

    UPDATE membership.Member
    SET Identifier = @Identifier, WindowsIdentity = @WindowsIdentity, FirstName = @FirstName, LastName = @LastName, Email = @Email
    WHERE Id = @Id;
END
ELSE
BEGIN
    INSERT membership.Member (Identifier, WindowsIdentity, FirstName, LastName, Email, CreatedAt)
    VALUES (@Identifier, @WindowsIdentity, @FirstName, @LastName, @Email, SYSDATETIMEOFFSET());
    SET @Id = CAST(SCOPE_IDENTITY() AS int);
END

DECLARE @new nvarchar(max) = (SELECT Id, Identifier, WindowsIdentity, FirstName, LastName, Email
                              FROM membership.Member WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy)
VALUES ('member', CAST(@Id AS nvarchar(100)), CASE WHEN @prev IS NULL THEN 'created' ELSE 'updated' END, @prev, @new, @Actor);

COMMIT;
SELECT @Id AS [key] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
