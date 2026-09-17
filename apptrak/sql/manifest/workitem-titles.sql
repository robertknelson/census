-- Every work item the database holds for a release; the loader diffs this against the
-- manifest to report orphans. Read-only.
SELECT Id, Title FROM moveit.WorkItem WHERE ReleaseId = @ReleaseId ORDER BY Id;
