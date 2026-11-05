-- Create (@Id NULL) or correct one link between two items (depends-on: the linked item must be
-- deployed first; related-to), audited, in one transaction. Unique by (item, linked item, kind) —
-- the table's key; an item never links to itself. THROW 50404: no such link or item; 50409: taken.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM moveit.WorkItem WHERE Id = @WorkItemId) OR NOT EXISTS (SELECT 1 FROM moveit.WorkItem WHERE Id = @LinkedWorkItemId)
    THROW 50404, 'One of the two items no longer exists.', 1;
IF @WorkItemId = @LinkedWorkItemId THROW 50409, 'An item cannot link to itself.', 1;
IF EXISTS (SELECT 1 FROM moveit.WorkItemLink WHERE WorkItemId = @WorkItemId AND LinkedWorkItemId = @LinkedWorkItemId AND Kind = @Kind AND (@Id IS NULL OR Id <> @Id))
    THROW 50409, 'Those two items are already linked that way.', 1;

DECLARE @prev nvarchar(max) = NULL;
IF @Id IS NOT NULL
BEGIN
    SET @prev = (SELECT * FROM moveit.WorkItemLink WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    IF @prev IS NULL THROW 50404, 'That link no longer exists.', 1;
    UPDATE moveit.WorkItemLink SET WorkItemId = @WorkItemId, LinkedWorkItemId = @LinkedWorkItemId, Kind = @Kind, Note = @Note WHERE Id = @Id;
END
ELSE
BEGIN
    INSERT moveit.WorkItemLink (WorkItemId, LinkedWorkItemId, Kind, Note, CreatedBy) VALUES (@WorkItemId, @LinkedWorkItemId, @Kind, @Note, @Actor);
    SET @Id = CAST(SCOPE_IDENTITY() AS int);
END

INSERT moveit.EditAudit (Entity, EntityId, ReleaseId, Action, PreviousValue, NewValue, ChangedBy, ImpersonatedBy)
VALUES ('link', @Id, (SELECT ReleaseId FROM moveit.WorkItem WHERE Id = @WorkItemId), CASE WHEN @prev IS NULL THEN 'created' ELSE 'updated' END, @prev,
        (SELECT * FROM moveit.WorkItemLink WHERE Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), @Actor, @ImpersonatedBy);

COMMIT;
SELECT @Id AS Id;
