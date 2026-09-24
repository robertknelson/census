-- Every release as entered, for the entry page's picker (move-it.md §15): the fields the
-- form re-sends unchanged when it adds to an existing release. Read-only.
SELECT Id AS ReleaseId, ApplicationId, Name, Kind, TargetDate, Note, CreatedAt
FROM moveit.Release
ORDER BY ApplicationId, Id DESC;
