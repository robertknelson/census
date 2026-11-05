-- Create (@Id NULL) or correct one feature or fix, audited, in one transaction. Every asserted
-- column is here: application, release (or none: the notebook), kind, title, description, built
-- by, external ref, the build it went in, the stage it was found in, removed (when and why). Its
-- release must be its application's; within a release a title is unique (the loader's identity).
-- THROW 50404: no such item or release; 50409: release of another application, or title taken.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF @ReleaseId IS NOT NULL
BEGIN
    DECLARE @releaseApp int = (SELECT ApplicationId FROM moveit.Release WHERE Id = @ReleaseId);
    IF @releaseApp IS NULL THROW 50404, 'That release no longer exists.', 1;
    IF @releaseApp <> @ApplicationId THROW 50409, 'That release belongs to another application.', 1;
    IF EXISTS (SELECT 1 FROM moveit.WorkItem WHERE ReleaseId = @ReleaseId AND Title = @Title AND (@Id IS NULL OR Id <> @Id))
        THROW 50409, 'That release already has an item with that title.', 1;
END

DECLARE @prev nvarchar(max) = NULL;
IF @Id IS NOT NULL
BEGIN
    SET @prev = (SELECT * FROM moveit.WorkItem WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    IF @prev IS NULL THROW 50404, 'That item no longer exists.', 1;

    UPDATE moveit.WorkItem
    SET ApplicationId = @ApplicationId, ReleaseId = @ReleaseId, Kind = @Kind, Title = @Title, Description = @Description,
        BuiltBy = @BuiltBy, ExternalRef = @ExternalRef, IncludedInBuild = @IncludedInBuild, FoundInStage = @FoundInStage,
        RemovedAt = @RemovedAt, RemovedNote = @RemovedNote
    WHERE Id = @Id;
END
ELSE
BEGIN
    INSERT moveit.WorkItem (ApplicationId, ReleaseId, Kind, Title, Description, BuiltBy, ExternalRef, IncludedInBuild, FoundInStage, RemovedAt, RemovedNote, CreatedBy)
    VALUES (@ApplicationId, @ReleaseId, @Kind, @Title, @Description, @BuiltBy, @ExternalRef, @IncludedInBuild, @FoundInStage, @RemovedAt, @RemovedNote, @Actor);
    SET @Id = CAST(SCOPE_IDENTITY() AS int);
END

INSERT moveit.EditAudit (Entity, EntityId, ReleaseId, Action, PreviousValue, NewValue, ChangedBy, ImpersonatedBy)
VALUES ('workitem', @Id, @ReleaseId, CASE WHEN @prev IS NULL THEN 'created' ELSE 'updated' END, @prev,
        (SELECT * FROM moveit.WorkItem WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), @Actor, @ImpersonatedBy);

COMMIT;
SELECT @Id AS Id;
