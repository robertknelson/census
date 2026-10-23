-- The roles a feature may be granted to (IRoleCatalog): AppTrak's member-types list, read as rows.
-- the same identifiers membership.MemberApplicationRole holds (personas.md §3). Read-only.

SELECT x.Identifier
FROM core.SelectItem x
JOIN core.SelectItem h ON h.Id = x.MasterId AND h.MasterId = -1 AND h.Identifier = 'member-types'
WHERE x.IsShow = 1
ORDER BY x.Sort, x.Identifier;
