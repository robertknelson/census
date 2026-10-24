-- What the visitor welcome offers (gatehouse.md §11.2): the applications in the registry that are not retired, and the
-- member-types roles by their display names. Nothing else about either: a visitor is not yet a member. Read-only.

SELECT 'application' AS Kind, a.Id, a.Identifier, a.Name
FROM membership.Application a
WHERE a.Disposition <> 'retired'
UNION ALL
SELECT 'role', x.Id, x.Identifier, x.Display
FROM core.SelectItem x
JOIN core.SelectItem h ON h.Id = x.MasterId AND h.MasterId = -1 AND h.Identifier = 'member-types'
WHERE x.IsShow = 1
ORDER BY 1, 4;
