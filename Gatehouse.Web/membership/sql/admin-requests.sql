-- The requests to join for the Membership page (gatehouse.md §11.4), waiting first, then the decided, newest first;
-- the role named, the applications as the request's JSON array of Ids (the page names them). Read-only.

SELECT q.MembershipRequestId, q.Identifier, q.WindowsIdentity, q.FirstName, q.LastName, q.Email, q.Reason,
       q.RoleId, r.Identifier AS Role, q.ApplicationIds, q.Status, q.RequestedAt, q.DecidedBy, q.DecidedAt, q.DecisionNote
FROM membership.MembershipRequest q
LEFT JOIN core.SelectItem r ON r.Id = q.RoleId
ORDER BY CASE WHEN q.Status = 'pending' THEN 0 ELSE 1 END, q.RequestedAt DESC, q.MembershipRequestId DESC;
