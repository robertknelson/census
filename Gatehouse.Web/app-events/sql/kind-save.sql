-- Register (@Id NULL) or correct one kind of work (gatehouse.md §12.3), with its audit row, in one transaction.
-- Retiring is a correction of Disposition: a kind is never deleted, because events keep naming it. The controller has
-- checked the form (kebab-case, NOUN-VERB). THROW 50404: no such kind or application; 50409: that name is taken.
-- Returns the kind's Id.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF @ApplicationId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM membership.Application WHERE Id = @ApplicationId)
    THROW 50404, 'That application no longer exists.', 1;
IF EXISTS (SELECT 1 FROM membership.AppEventKind WITH (UPDLOCK, HOLDLOCK)
           WHERE Namespace = @Namespace AND CommandName = @CommandName AND (@Id IS NULL OR AppEventKindId <> @Id))
    THROW 50409, 'That kind is registered already.', 1;

DECLARE @prev nvarchar(max) = NULL;
IF @Id IS NOT NULL
BEGIN
    SET @prev = (SELECT AppEventKindId, Namespace, CommandName, DisplayName, Description, ApplicationId, Disposition
                 FROM membership.AppEventKind WHERE AppEventKindId = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    IF @prev IS NULL THROW 50404, 'That kind no longer exists.', 1;
    UPDATE membership.AppEventKind
    SET Namespace = @Namespace, CommandName = @CommandName, DisplayName = @DisplayName, Description = @Description,
        ApplicationId = @ApplicationId, Disposition = @Disposition
    WHERE AppEventKindId = @Id;
END
ELSE
BEGIN
    INSERT membership.AppEventKind (Namespace, CommandName, DisplayName, Description, ApplicationId, Disposition, CreatedBy)
    VALUES (@Namespace, @CommandName, @DisplayName, @Description, @ApplicationId, @Disposition, @Actor);
    SET @Id = CAST(SCOPE_IDENTITY() AS int);
END

DECLARE @new nvarchar(max) = (SELECT AppEventKindId, Namespace, CommandName, DisplayName, Description, ApplicationId, Disposition
                              FROM membership.AppEventKind WHERE AppEventKindId = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy)
VALUES ('app-event-kind', CAST(@Id AS nvarchar(100)),
        CASE WHEN @prev IS NULL THEN 'created'
             WHEN JSON_VALUE(@prev, '$.Disposition') <> @Disposition THEN CASE WHEN @Disposition = 'retired' THEN 'retired' ELSE 'restored' END
             ELSE 'updated' END,
        @prev, @new, @Actor);

COMMIT;
SELECT @Id AS [key] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
