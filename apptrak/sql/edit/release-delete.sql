-- Delete one release and everything asserted under it, audited with all of it, in one transaction.
-- The cascade is release-delete.sql's (manifest/, move-it.md §16): links touching its items, its
-- events, its build claims, its items, the release; items heard before the release go back to the
-- notebook (no release, no build) and keep their links. moveit.Deployment is observed and never
-- touched. THROW 50404: no such release.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @prev nvarchar(max) = (
    SELECT r.*,
           (SELECT w.* FROM moveit.WorkItem w WHERE w.ReleaseId = r.Id FOR JSON PATH) AS WorkItems,
           (SELECT b.* FROM moveit.ReleaseBuild b WHERE b.ReleaseId = r.Id FOR JSON PATH) AS Builds,
           (SELECT e.* FROM moveit.ReleaseEvent e WHERE e.ReleaseId = r.Id FOR JSON PATH) AS Events,
           (SELECT l.* FROM moveit.WorkItemLink l
             WHERE l.WorkItemId IN (SELECT Id FROM moveit.WorkItem WHERE ReleaseId = r.Id)
                OR l.LinkedWorkItemId IN (SELECT Id FROM moveit.WorkItem WHERE ReleaseId = r.Id) FOR JSON PATH) AS Links
    FROM moveit.Release r WHERE r.Id = @Id
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
IF @prev IS NULL THROW 50404, 'That release no longer exists.', 1;

DECLARE @CreatedAt datetimeoffset = (SELECT CreatedAt FROM moveit.Release WHERE Id = @Id);
UPDATE moveit.WorkItem SET ReleaseId = NULL, IncludedInBuild = NULL WHERE ReleaseId = @Id AND CreatedAt < @CreatedAt;

DECLARE @Items TABLE (Id int PRIMARY KEY);
INSERT @Items SELECT Id FROM moveit.WorkItem WHERE ReleaseId = @Id;
DELETE FROM moveit.WorkItemLink WHERE WorkItemId IN (SELECT Id FROM @Items) OR LinkedWorkItemId IN (SELECT Id FROM @Items);
DELETE FROM moveit.ReleaseEvent WHERE ReleaseId = @Id;
DELETE FROM moveit.ReleaseBuild WHERE ReleaseId = @Id;
DELETE FROM moveit.WorkItem WHERE ReleaseId = @Id;
DELETE FROM moveit.Release WHERE Id = @Id;

INSERT moveit.EditAudit (Entity, EntityId, ReleaseId, Action, PreviousValue, NewValue, ChangedBy)
VALUES ('release', @Id, @Id, 'deleted', @prev, NULL, @Actor);

COMMIT;
SELECT @Id AS Id;
