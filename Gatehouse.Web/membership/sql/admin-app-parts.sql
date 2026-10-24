-- Every application's parts for the membership page, one row each, Part saying which: the roles it
-- uses (with alias), its stages (with its own name for each), its services. Read-only.

SELECT 'role' AS Part, r.ApplicationRole AS ApplicationId, r.RoleId AS PartKey, x.Identifier AS Value,
       r.Alias AS Detail, r.RoleId AS ListId, CAST(NULL AS date) AS StartOn, CAST(NULL AS nvarchar(50)) AS Status
FROM membership.ApplicationRole r LEFT JOIN core.SelectItem x ON x.Id = r.RoleId
UNION ALL
SELECT 'stage', s.ApplicationId, s.StageId, x.Identifier, s.Name, s.StageId, NULL, NULL
FROM membership.ApplicationStage s LEFT JOIN core.SelectItem x ON x.Id = s.StageId
UNION ALL
SELECT 'service', v.ApplicationId, v.Id, x.Identifier, NULL, v.ServiceTypeId, v.StartOn, v.Status
FROM membership.ApplicationService v LEFT JOIN core.SelectItem x ON x.Id = v.ServiceTypeId
ORDER BY 2, 1, 4;
