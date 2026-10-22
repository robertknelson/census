-- The last corrections made from the curate pages, newest first. Read-only.

SELECT TOP 30 EditAuditId, Entity, EntityId, ReleaseId, Action, PreviousValue, NewValue, ChangedBy, ChangedAt
FROM moveit.EditAudit
ORDER BY ChangedAt DESC, EditAuditId DESC;
