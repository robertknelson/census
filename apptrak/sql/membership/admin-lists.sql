-- The lists the membership page picks from: application-types, member-types (the roles), stages and
-- service-types.
-- Read-only.

SELECT h.Identifier AS List, x.Id, x.Identifier, x.Display, x.Sort
FROM core.SelectItem x
JOIN core.SelectItem h ON h.Id = x.MasterId AND h.MasterId = -1
WHERE h.Identifier IN ('application-types', 'member-types', 'stages', 'service-types') AND x.IsShow = 1
ORDER BY h.Identifier, x.Sort, x.Display;
