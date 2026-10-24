-- The catalog of kinds (gatehouse.md §12.3), every one, current first, with its owning application. Read-only.

SELECT k.AppEventKindId, k.Namespace, k.CommandName, k.DisplayName, k.Description, k.ApplicationId, a.Name AS ApplicationName,
       k.Disposition, k.CreatedAt, k.CreatedBy
FROM membership.AppEventKind k
LEFT JOIN membership.Application a ON a.Id = k.ApplicationId
ORDER BY CASE WHEN k.Disposition = 'current' THEN 0 ELSE 1 END, k.Namespace, k.CommandName;
