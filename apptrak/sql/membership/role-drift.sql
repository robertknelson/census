-- One list of roles (census-on-apptrak.md §4, D-002): core.SelectItem's member-types is the only definition of a role.
-- This reports every place that names a role the list does not offer: a feature granted to it (fm.FeatureRole), a
-- member holding it on an application (membership.MemberApplicationRole), an application offering it
-- (membership.ApplicationRole). "retired" when the list still has it but no longer shows it (IsShow = 0), "not on the
-- list" when it is not there at all. A report, never a constraint (CA-4): the real list is not Census's to lock.
-- Read-only. Columns: Place, Role, Problem, Detail.

SET NOCOUNT ON;

DECLARE @roles TABLE (Id int, Identifier nvarchar(100), IsShow bit);
INSERT @roles
SELECT x.Id, x.Identifier, x.IsShow
FROM core.SelectItem x
JOIN core.SelectItem h ON h.Id = x.MasterId AND h.MasterId = -1 AND h.Identifier = 'member-types';

SELECT 'feature' AS Place, fr.RoleName AS Role,
       CASE WHEN r.Id IS NULL THEN 'not on the list' ELSE 'retired' END AS Problem,
       f.Name AS Detail
FROM fm.FeatureRole fr
JOIN fm.Feature f ON f.FeatureId = fr.FeatureId AND f.IsVoided = 0
LEFT JOIN @roles r ON r.Identifier = fr.RoleName
WHERE r.Id IS NULL OR r.IsShow = 0

UNION ALL

SELECT 'grant', COALESCE(s.Identifier, CONCAT('#', g.RoleId)),
       CASE WHEN r.Id IS NULL THEN 'not on the list' ELSE 'retired' END,
       CONCAT(m.Identifier, ' on ', a.Name)
FROM membership.MemberApplicationRole g
JOIN membership.Member m ON m.Id = g.MemberId
JOIN membership.Application a ON a.Id = g.ApplicationId
LEFT JOIN core.SelectItem s ON s.Id = g.RoleId
LEFT JOIN @roles r ON r.Id = g.RoleId
WHERE r.Id IS NULL OR r.IsShow = 0

UNION ALL

SELECT 'application', COALESCE(s.Identifier, CONCAT('#', ar.RoleId)),
       CASE WHEN r.Id IS NULL THEN 'not on the list' ELSE 'retired' END,
       a.Name
FROM membership.ApplicationRole ar
JOIN membership.Application a ON a.Id = ar.ApplicationRole
LEFT JOIN core.SelectItem s ON s.Id = ar.RoleId
LEFT JOIN @roles r ON r.Id = ar.RoleId
WHERE r.Id IS NULL OR r.IsShow = 0

ORDER BY Place, Role, Detail;
