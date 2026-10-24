-- Gatehouse's features and their first grants (gatehouse.md §7), in Gatehouse's own fm (G-R9: fm serves one
-- application, so the names carry no prefix). Insert-only and idempotent: a feature that exists is never changed, and
-- grants are written only for the features this run creates, so a grant revoked on the page stays revoked.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @features TABLE (Name varchar(100), DisplayName nvarchar(150), Description nvarchar(1000));
INSERT @features VALUES
    ('logs.explorer', N'Log Explorer', N'Requests, exceptions and messages in the shared log tables'),
    ('logs.trace', N'Trace', N'One identifier''s month, day and sessions'),
    ('logs.usage', N'Usage', N'How an application is used, from its click streams'),
    ('admin.membership', N'Membership', N'Applications, members and the roles they hold'),
    ('logs.app-events', N'App events', N'Every unit of business work, across systems (gatehouse.md §12)'),
    ('admin.app-event-kinds', N'Event kinds', N'The catalog of kinds of work the events name'),
    ('logs.usage-summary', N'Usage summary', N'Every application''s usage at once');

DECLARE @grants TABLE (Name varchar(100), RoleName varchar(100));
INSERT @grants VALUES
    ('logs.explorer', 'system-administrator'), ('logs.explorer', 'technical-lead'), ('logs.explorer', 'devops-lead'),
    ('logs.trace', 'system-administrator'), ('logs.trace', 'technical-lead'), ('logs.trace', 'devops-lead'),
    ('logs.usage', 'system-administrator'), ('logs.usage', 'technical-lead'), ('logs.usage', 'product-owner'), ('logs.usage', 'application-owner'),
    ('admin.membership', 'system-administrator'),
    ('logs.app-events', 'system-administrator'), ('admin.app-event-kinds', 'system-administrator'),
    ('logs.usage-summary', 'system-administrator'), ('logs.usage-summary', 'executive');

DECLARE @created TABLE (FeatureId int, Name varchar(100));
INSERT fm.Feature (Name, DisplayName, Description, IsEnabled, CreatedBy)
OUTPUT inserted.FeatureId, inserted.Name INTO @created
SELECT f.Name, f.DisplayName, f.Description, 1, 'gatehouse-seed'
FROM @features f
WHERE NOT EXISTS (SELECT 1 FROM fm.Feature x WHERE x.Name = f.Name AND x.IsVoided = 0);

INSERT fm.FeatureRole (FeatureId, RoleName, GrantedBy)
SELECT c.FeatureId, g.RoleName, 'gatehouse-seed'
FROM @created c JOIN @grants g ON g.Name = c.Name;

INSERT fm.FeatureAudit (FeatureId, Action, PreviousValue, NewValue, ChangedBy)
SELECT c.FeatureId, 'create', NULL, fm.FeatureSnapshot(c.FeatureId), 'gatehouse-seed'
FROM @created c;

COMMIT;

SELECT f.Name, f.IsEnabled, (SELECT STRING_AGG(fr.RoleName, ', ') FROM fm.FeatureRole fr WHERE fr.FeatureId = f.FeatureId) AS Roles
FROM fm.Feature f WHERE f.IsVoided = 0 ORDER BY f.Name;
