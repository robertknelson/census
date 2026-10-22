-- The two lists the membership page picks from: application-types and member-types (the roles).
-- Read-only.

SELECT h.Identifier AS List, x.Id, x.Identifier, x.Display, x.Sort
FROM core.SelectItem x
JOIN core.SelectItem h ON h.Id = x.MasterId AND h.MasterId = -1
WHERE h.Identifier IN ('application-types', 'member-types') AND x.IsShow = 1
ORDER BY h.Identifier, x.Sort, x.Display;
