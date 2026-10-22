-- Every member and every role they hold, one row per grant (personas.md §3). A member with no
-- grant appears once, with NULL application and role. Roles are the member-types list only.
-- Read-only; Census never writes membership.

SELECT m.Id AS MemberId, m.Identifier, m.WindowsIdentity, m.FirstName, m.LastName,
       g.ApplicationId, a.Identifier AS Application, a.Name AS ApplicationName,
       r.Identifier AS Role
FROM membership.Member m
LEFT JOIN membership.MemberApplicationRole g ON g.MemberId = m.Id
LEFT JOIN membership.Application a ON a.Id = g.ApplicationId
LEFT JOIN core.SelectItem r ON r.Id = g.RoleId
     AND r.MasterId = (SELECT h.Id FROM core.SelectItem h WHERE h.MasterId = -1 AND h.Identifier = 'member-types')
ORDER BY m.LastName, m.FirstName, m.Id, a.Name;
