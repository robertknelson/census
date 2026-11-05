-- Delete one feature or fix and its links (either direction), audited with both, in one
-- transaction. THROW 50404: no such item.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @prev nvarchar(max) = (
    SELECT w.*, (SELECT l.* FROM moveit.WorkItemLink l WHERE l.WorkItemId = w.Id OR l.LinkedWorkItemId = w.Id FOR JSON PATH) AS Links
    FROM moveit.WorkItem w WHERE w.Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
IF @prev IS NULL THROW 50404, 'That item no longer exists.', 1;
DECLARE @releaseId int = (SELECT ReleaseId FROM moveit.WorkItem WHERE Id = @Id);

DELETE FROM moveit.WorkItemLink WHERE WorkItemId = @Id OR LinkedWorkItemId = @Id;
DELETE FROM moveit.WorkItem WHERE Id = @Id;

INSERT moveit.EditAudit (Entity, EntityId, ReleaseId, Action, PreviousValue, NewValue, ChangedBy, ImpersonatedBy)
VALUES ('workitem', @Id, @releaseId, 'deleted', @prev, NULL, @Actor, @ImpersonatedBy);

COMMIT;
SELECT @Id AS Id;
