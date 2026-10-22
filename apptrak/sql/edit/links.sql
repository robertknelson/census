-- Every link between items as stored, for the curate pages. Read-only.

SELECT Id AS LinkId, WorkItemId, LinkedWorkItemId, Kind, Note, CreatedAt, CreatedBy
FROM moveit.WorkItemLink
ORDER BY Id;
