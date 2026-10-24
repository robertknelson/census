-- Usage's scope (gatehouse.md §13 U-R1): the registry applications the member holds a role on, by name and identifier.
-- A log row belongs to one of them when its Application is either, ignoring case. On AppTrak (the default connection).
-- Read-only.

SELECT DISTINCT a.Name AS name, a.Identifier AS identifier
FROM membership.Member m
JOIN membership.MemberApplicationRole g ON g.MemberId = m.Id
JOIN membership.Application a ON a.Id = g.ApplicationId
WHERE m.Identifier = @Identifier
ORDER BY a.Name;
