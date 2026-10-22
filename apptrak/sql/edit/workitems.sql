-- Every feature and fix as stored, every asserted column, for the curate pages. Read-only.

SELECT Id AS WorkItemId, ApplicationId, ReleaseId, Kind, Title, Description, BuiltBy, ExternalRef,
       IncludedInBuild, FoundInStage, RemovedAt, RemovedNote, CreatedAt, CreatedBy
FROM moveit.WorkItem
ORDER BY CreatedAt DESC, Id DESC;
