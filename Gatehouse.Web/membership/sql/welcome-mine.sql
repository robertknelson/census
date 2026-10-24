-- The visitor's own latest request (gatehouse.md §11.2), by the identifier they signed in with, its applications and
-- role named. No row when they have not asked. Read-only.

SELECT TOP 1 q.MembershipRequestId, q.WindowsIdentity, q.FirstName, q.LastName, q.Email, q.Reason, q.Status,
       q.RequestedAt, q.DecidedAt, q.DecisionNote, r.Display AS Role,
       (SELECT STRING_AGG(a.Name, ', ') WITHIN GROUP (ORDER BY a.Name)
        FROM OPENJSON(q.ApplicationIds) j JOIN membership.Application a ON a.Id = TRY_CAST(j.value AS int)) AS Applications
FROM membership.MembershipRequest q
LEFT JOIN core.SelectItem r ON r.Id = q.RoleId
WHERE q.Identifier = @Identifier
ORDER BY q.RequestedAt DESC, q.MembershipRequestId DESC;
