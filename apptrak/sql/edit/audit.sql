-- One release's history on the curate pages, newest first: the release and everything under it,
-- deletes included. Read-only.

SELECT TOP 100 EditAuditId, Entity, EntityId, ReleaseId, Action, PreviousValue, NewValue, ChangedBy, ChangedAt
FROM moveit.EditAudit
WHERE ReleaseId = @ReleaseId
ORDER BY ChangedAt DESC, EditAuditId DESC;
