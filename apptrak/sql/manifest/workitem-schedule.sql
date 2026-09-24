-- A heard item goes into a release (move-it.md 20): set ReleaseId where it is null, once.
-- An item already in a release is left alone; moving between releases is not offered.
UPDATE moveit.WorkItem
SET ReleaseId = @ReleaseId
WHERE Id = @Id AND ApplicationId = @ApplicationId AND ReleaseId IS NULL;
SELECT CASE WHEN @@ROWCOUNT = 1 THEN 'scheduled' ELSE 'unchanged' END AS Outcome;
