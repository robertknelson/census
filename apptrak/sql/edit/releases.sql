-- Every release as stored, for the curate pages (personas.md §6.3). Read-only.

SELECT Id AS ReleaseId, ApplicationId, Name, Kind, TargetDate, Note, CreatedAt, CreatedBy
FROM moveit.Release
ORDER BY CreatedAt DESC, Id DESC;
