-- Gatehouse's local catalog of kinds (gatehouse.md §12.3, §12.5), in the local AppTrak. LOCAL ONLY. Insert-only: a kind
-- that exists is never changed. billing / invoice-send is left out on purpose: the demo events name it, so the catalog
-- screen shows it as seen but not registered.

SET NOCOUNT ON;

INSERT membership.AppEventKind (Namespace, CommandName, DisplayName, Description, ApplicationId, CreatedBy)
SELECT k.Namespace, k.CommandName, k.DisplayName, k.Description, a.Id, N'gatehouse-seed'
FROM (VALUES
    (N'underwriting', N'quote-request', N'Quote request', N'A quote asked for in the portal, rated by the ledger and the mainframe', NULL),
    (N'membership', N'access-request', N'Request to join', N'A visitor asks to join; an administrator approves or declines (gatehouse.md §11)', N'gatehouse')
) k (Namespace, CommandName, DisplayName, Description, Owner)
LEFT JOIN membership.Application a ON a.Identifier = k.Owner
WHERE NOT EXISTS (SELECT 1 FROM membership.AppEventKind x WHERE x.Namespace = k.Namespace AND x.CommandName = k.CommandName);

SELECT Namespace, CommandName, Disposition FROM membership.AppEventKind ORDER BY Namespace, CommandName;
