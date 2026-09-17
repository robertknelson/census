-- One link, keyed by (WorkItemId, LinkedWorkItemId, Kind) — the table's unique constraint.
-- Only the note can change.
DECLARE @id int = (SELECT Id FROM moveit.WorkItemLink WHERE WorkItemId = @WorkItemId AND LinkedWorkItemId = @LinkedWorkItemId AND Kind = @Kind);

IF @id IS NULL
BEGIN
    INSERT moveit.WorkItemLink (WorkItemId, LinkedWorkItemId, Kind, Note, CreatedBy)
    VALUES (@WorkItemId, @LinkedWorkItemId, @Kind, @Note, @By);
    SELECT CAST(SCOPE_IDENTITY() AS int) AS Id, 'inserted' AS Outcome;
END
ELSE IF EXISTS (SELECT Note FROM moveit.WorkItemLink WHERE Id = @id EXCEPT SELECT @Note)
BEGIN
    UPDATE moveit.WorkItemLink SET Note = @Note WHERE Id = @id;
    SELECT @id AS Id, 'updated' AS Outcome;
END
ELSE
    SELECT @id AS Id, 'unchanged' AS Outcome;
