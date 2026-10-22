-- The membership page's application list: every registered application, its type, and how many
-- members hold a role on it. Read-only.

SELECT a.Id AS ApplicationId, a.Identifier, a.Name, a.Tags, a.Disposition,
       a.ApplicationTypeId, t.Display AS ApplicationType, a.Settings, a.CreatedAt,
       (SELECT COUNT(DISTINCT g.MemberId) FROM membership.MemberApplicationRole g WHERE g.ApplicationId = a.Id) AS Members
FROM membership.Application a
LEFT JOIN core.SelectItem t ON t.Id = a.ApplicationTypeId
ORDER BY a.Name, a.Id;
