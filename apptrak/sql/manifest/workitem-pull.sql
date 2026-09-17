-- Pull an item from its release (move-it.md §16): an assertion with a reason, never a delete.
-- Idempotent: an item already pulled is left as it was.
UPDATE moveit.WorkItem
SET RemovedAt = sysdatetimeoffset(), RemovedNote = @Note
WHERE Id = @Id AND RemovedAt IS NULL;
SELECT CASE WHEN @@ROWCOUNT = 1 THEN 'pulled' ELSE 'unchanged' END AS Outcome;
