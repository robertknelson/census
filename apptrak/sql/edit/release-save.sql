-- Create (@Id NULL) or correct one release, audited, in one transaction. A release is unique by
-- (application, name) — the manifest loader's identity (move-it.md §14). Moving a release to
-- another application moves its items with it, so an item's application never disagrees with its
-- release's. THROW 50404: no such release or application; 50409: name taken there.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM membership.Application WHERE Id = @ApplicationId)
   AND NOT EXISTS (SELECT 1 FROM moveit.Release WHERE ApplicationId = @ApplicationId)
   AND NOT EXISTS (SELECT 1 FROM health.HealthEndpoint WHERE ApplicationId = @ApplicationId)
    THROW 50404, 'That application is not known.', 1;
IF EXISTS (SELECT 1 FROM moveit.Release WHERE ApplicationId = @ApplicationId AND Name = @Name AND (@Id IS NULL OR Id <> @Id))
    THROW 50409, 'That application already has a release with that name.', 1;

DECLARE @prev nvarchar(max) = NULL;
IF @Id IS NOT NULL
BEGIN
    SET @prev = (SELECT * FROM moveit.Release WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    IF @prev IS NULL THROW 50404, 'That release no longer exists.', 1;

    UPDATE moveit.Release SET ApplicationId = @ApplicationId, Name = @Name, Kind = @Kind, TargetDate = @TargetDate, Note = @Note
    WHERE Id = @Id;
    UPDATE moveit.WorkItem SET ApplicationId = @ApplicationId WHERE ReleaseId = @Id AND ApplicationId <> @ApplicationId;
END
ELSE
BEGIN
    INSERT moveit.Release (ApplicationId, Name, Kind, TargetDate, Note, CreatedBy)
    VALUES (@ApplicationId, @Name, @Kind, @TargetDate, @Note, @Actor);
    SET @Id = CAST(SCOPE_IDENTITY() AS int);
END

INSERT moveit.EditAudit (Entity, EntityId, ReleaseId, Action, PreviousValue, NewValue, ChangedBy)
VALUES ('release', @Id, @Id, CASE WHEN @prev IS NULL THEN 'created' ELSE 'updated' END, @prev,
        (SELECT * FROM moveit.Release WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), @Actor);

COMMIT;
SELECT @Id AS Id;
