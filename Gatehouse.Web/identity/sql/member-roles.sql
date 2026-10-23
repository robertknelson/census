-- Gatehouse identity (gatehouse.md §5): one member by Identifier (the Windows username, case-insensitive by the
-- database's collation) with the member-types roles they hold on one application. No row when there is no member.
-- Roles come from core.SelectItem's member-types list; a grant is membership.MemberApplicationRole.

SELECT m.Identifier AS identifier, m.FirstName AS firstName, m.LastName AS lastName,
       JSON_QUERY(COALESCE((
           SELECT JSON_QUERY('[' + STRING_AGG(CONVERT(nvarchar(max), '"' + STRING_ESCAPE(r.Identifier, 'json') + '"'), ',')
                                   WITHIN GROUP (ORDER BY r.Identifier) + ']')
           FROM membership.MemberApplicationRole g
           JOIN membership.Application a ON a.Id = g.ApplicationId AND a.Identifier = @Application
           JOIN core.SelectItem r ON r.Id = g.RoleId
           JOIN core.SelectItem h ON h.Id = r.MasterId AND h.MasterId = -1 AND h.Identifier = 'member-types'
           WHERE g.MemberId = m.Id), '[]')) AS roles
FROM membership.Member m
WHERE m.Identifier = @Identifier
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES;
