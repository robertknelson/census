-- Delete one build claim, event or link (@Entity: build | event | link), audited with the row, in one
-- transaction. A release and an item have their own scripts: they cascade. THROW 50404: gone.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @prev nvarchar(max), @releaseId int;
IF @Entity = 'build'
BEGIN
    SELECT @prev = (SELECT * FROM moveit.ReleaseBuild WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           @releaseId = (SELECT ReleaseId FROM moveit.ReleaseBuild WHERE Id = @Id);
    DELETE FROM moveit.ReleaseBuild WHERE Id = @Id;
END
ELSE IF @Entity = 'event'
BEGIN
    SELECT @prev = (SELECT * FROM moveit.ReleaseEvent WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           @releaseId = (SELECT ReleaseId FROM moveit.ReleaseEvent WHERE Id = @Id);
    DELETE FROM moveit.ReleaseEvent WHERE Id = @Id;
END
ELSE IF @Entity = 'link'
BEGIN
    SELECT @prev = (SELECT * FROM moveit.WorkItemLink WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
           @releaseId = (SELECT w.ReleaseId FROM moveit.WorkItemLink l JOIN moveit.WorkItem w ON w.Id = l.WorkItemId WHERE l.Id = @Id);
    DELETE FROM moveit.WorkItemLink WHERE Id = @Id;
END

IF @prev IS NULL THROW 50404, 'That no longer exists.', 1;

INSERT moveit.EditAudit (Entity, EntityId, ReleaseId, Action, PreviousValue, NewValue, ChangedBy, ImpersonatedBy)
VALUES (@Entity, @Id, @releaseId, 'deleted', @prev, NULL, @Actor, @ImpersonatedBy);

COMMIT;
SELECT @Id AS Id;
