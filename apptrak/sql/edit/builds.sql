-- Every build claim as stored, for the curate pages. Read-only.

SELECT Id AS ReleaseBuildId, ReleaseId, Build, Note, CreatedAt, CreatedBy
FROM moveit.ReleaseBuild
ORDER BY ReleaseId, CreatedAt, Id;
