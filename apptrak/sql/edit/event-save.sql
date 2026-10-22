-- Create (@Id NULL) or correct one release event, audited, in one transaction. Correcting an event
-- in place is Robert's ruling of 2026-10-22 ("i need to be able to correct anything"), reversing
-- move-it.md §14's "events are never updated" for the curate pages; the audit keeps what it was.
-- THROW 50404: no such event or release.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM moveit.Release WHERE Id = @ReleaseId) THROW 50404, 'That release no longer exists.', 1;

DECLARE @prev nvarchar(max) = NULL;
IF @Id IS NOT NULL
BEGIN
    SET @prev = (SELECT * FROM moveit.ReleaseEvent WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    IF @prev IS NULL THROW 50404, 'That event no longer exists.', 1;
    UPDATE moveit.ReleaseEvent SET ReleaseId = @ReleaseId, Kind = @Kind, Stage = @Stage, Build = @Build, At = @At, [By] = @EventBy, Note = @Note
    WHERE Id = @Id;
END
ELSE
BEGIN
    INSERT moveit.ReleaseEvent (ReleaseId, Kind, Stage, Build, At, [By], Note, CreatedBy)
    VALUES (@ReleaseId, @Kind, @Stage, @Build, @At, @EventBy, @Note, @Actor);
    SET @Id = CAST(SCOPE_IDENTITY() AS int);
END

INSERT moveit.EditAudit (Entity, EntityId, ReleaseId, Action, PreviousValue, NewValue, ChangedBy)
VALUES ('event', @Id, @ReleaseId, CASE WHEN @prev IS NULL THEN 'created' ELSE 'updated' END, @prev,
        (SELECT * FROM moveit.ReleaseEvent WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), @Actor);

COMMIT;
SELECT @Id AS Id;
