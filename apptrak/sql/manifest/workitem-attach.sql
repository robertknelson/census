-- An item entered as work in progress is now carried by a named build: set where it first
-- appeared, once. An item that already has a build is left alone (a different build later is
-- a rollback or a move, which the ledger observes; it is not a second first appearance).
UPDATE moveit.WorkItem
SET IncludedInBuild = @Build
WHERE Id = @Id AND ReleaseId = @ReleaseId AND IncludedInBuild IS NULL;
SELECT CASE WHEN @@ROWCOUNT = 1 THEN 'attached' ELSE 'unchanged' END AS Outcome;
