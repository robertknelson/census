-- One kind's history, or (@Id 0) the catalog's last 30 changes, newest first (gatehouse.md §12.3). Read-only.

SELECT TOP 30 a.MembershipAuditId, a.Entity, a.EntityKey, a.Action, a.PreviousValue, a.NewValue, a.ChangedBy, a.ChangedAt
FROM membership.MembershipAudit a
WHERE a.Entity = 'app-event-kind' AND (@Id = 0 OR a.EntityKey = CAST(@Id AS nvarchar(100)))
ORDER BY a.ChangedAt DESC, a.MembershipAuditId DESC;
