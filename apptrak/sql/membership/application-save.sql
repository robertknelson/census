-- Create (@Id NULL) or update one application from the membership page, with its audit row, in
-- one transaction. The identifier is unique by this rule (the table has no constraint for it).
-- THROW 50404: no such application; 50409: identifier taken. Returns the Id.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM membership.Application WHERE Identifier = @Identifier AND (@Id IS NULL OR Id <> @Id))
    THROW 50409, 'Another application already has that identifier.', 1;

DECLARE @prev nvarchar(max) = NULL;
IF @Id IS NOT NULL
BEGIN
    SET @prev = (SELECT Id, Identifier, Name, Tags, Disposition, ApplicationTypeId, JSON_QUERY(Settings) AS Settings
                 FROM membership.Application WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    IF @prev IS NULL THROW 50404, 'That application no longer exists.', 1;

    UPDATE membership.Application
    SET Identifier = @Identifier, Name = @Name, Tags = @Tags, Disposition = @Disposition,
        ApplicationTypeId = @ApplicationTypeId, Settings = @Settings
    WHERE Id = @Id;
END
ELSE
BEGIN
    INSERT membership.Application (Identifier, Name, Tags, Disposition, ApplicationTypeId, Settings)
    VALUES (@Identifier, @Name, @Tags, @Disposition, @ApplicationTypeId, @Settings);
    SET @Id = CAST(SCOPE_IDENTITY() AS int);
END

DECLARE @new nvarchar(max) = (SELECT Id, Identifier, Name, Tags, Disposition, ApplicationTypeId, JSON_QUERY(Settings) AS Settings
                              FROM membership.Application WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy, ImpersonatedBy)
VALUES ('application', CAST(@Id AS nvarchar(100)), CASE WHEN @prev IS NULL THEN 'created' ELSE 'updated' END, @prev, @new, @Actor, @ImpersonatedBy);

COMMIT;
SELECT @Id AS Id;
