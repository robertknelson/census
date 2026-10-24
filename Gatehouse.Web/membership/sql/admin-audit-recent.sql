-- The membership landing page's recent changes: the last 15 writes made from the page, newest
-- first. Read-only.

SELECT TOP 15 a.MembershipAuditId, a.Entity, a.EntityKey, a.Action, a.PreviousValue, a.NewValue, a.ChangedBy, a.ChangedAt
FROM membership.MembershipAudit a
ORDER BY a.ChangedAt DESC, a.MembershipAuditId DESC;
