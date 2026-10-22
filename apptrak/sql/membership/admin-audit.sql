-- One application's or one member's history on the membership page, newest first: the rows about
-- it, and the grants that name it. @Entity is 'application' or 'member'; @Id its Id. Read-only.

SELECT TOP 50 a.MembershipAuditId, a.Entity, a.EntityKey, a.Action, a.PreviousValue, a.NewValue, a.ChangedBy, a.ChangedAt
FROM membership.MembershipAudit a
WHERE (a.Entity = @Entity AND a.EntityKey = CAST(@Id AS nvarchar(100)))
   OR (a.Entity = 'grant' AND @Entity = 'member'      AND a.EntityKey LIKE CAST(@Id AS nvarchar(20)) + ':%')
   OR (a.Entity = 'grant' AND @Entity = 'application' AND a.EntityKey LIKE '%:' + CAST(@Id AS nvarchar(20)) + ':%')
ORDER BY a.ChangedAt DESC, a.MembershipAuditId DESC;
