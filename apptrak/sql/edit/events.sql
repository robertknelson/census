-- Every release event as stored, 'note' included, for the curate pages. Read-only.

SELECT Id AS EventId, ReleaseId, Kind, Stage, Build, At, [By], Note, CreatedAt, CreatedBy
FROM moveit.ReleaseEvent
ORDER BY At DESC, Id DESC;
