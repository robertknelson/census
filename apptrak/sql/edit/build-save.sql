-- Create (@Id NULL) or correct one build claim (a release says a build is its), audited, in one
-- transaction. Unique by (release, build) — the table's key. THROW 50404: no such claim or
-- release; 50409: that release already claims that build.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM moveit.Release WHERE Id = @ReleaseId) THROW 50404, 'That release no longer exists.', 1;
IF EXISTS (SELECT 1 FROM moveit.ReleaseBuild WHERE ReleaseId = @ReleaseId AND Build = @Build AND (@Id IS NULL OR Id <> @Id))
    THROW 50409, 'That release already claims that build.', 1;

DECLARE @prev nvarchar(max) = NULL;
IF @Id IS NOT NULL
BEGIN
    SET @prev = (SELECT * FROM moveit.ReleaseBuild WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    IF @prev IS NULL THROW 50404, 'That build claim no longer exists.', 1;
    UPDATE moveit.ReleaseBuild SET ReleaseId = @ReleaseId, Build = @Build, Note = @Note WHERE Id = @Id;
END
ELSE
BEGIN
    INSERT moveit.ReleaseBuild (ReleaseId, Build, Note, CreatedBy) VALUES (@ReleaseId, @Build, @Note, @Actor);
    SET @Id = CAST(SCOPE_IDENTITY() AS int);
END

INSERT moveit.EditAudit (Entity, EntityId, ReleaseId, Action, PreviousValue, NewValue, ChangedBy, ImpersonatedBy)
VALUES ('build', @Id, @ReleaseId, CASE WHEN @prev IS NULL THEN 'created' ELSE 'updated' END, @prev,
        (SELECT * FROM moveit.ReleaseBuild WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), @Actor, @ImpersonatedBy);

COMMIT;
SELECT @Id AS Id;
