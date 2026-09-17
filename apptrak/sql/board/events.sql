-- Every human event, for the release page (move-it.md §16). Read-only.
SELECT Id AS EventId, ReleaseId, Kind, Stage, Build, At, [By], Note, CreatedAt, CreatedBy
FROM moveit.ReleaseEvent
ORDER BY ReleaseId, At, Id;
