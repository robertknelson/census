-- Census's features and their first grants (personas.md §6), in FM2280's fm schema.
-- Moved here from config/features.json 2026-10-22, when the feature access page came in: the
-- grants are now edited on that page, and this file only puts in what is missing.
--
-- Insert-only and idempotent: a feature that exists is never changed, and grants are written only
-- for features this run creates, so a grant revoked on the page stays revoked. Runs on the real
-- AppTrak too (after 001-fm-schema.sql); it carries no demo data.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @features TABLE (Name varchar(100), DisplayName nvarchar(150), Description nvarchar(1000));
INSERT @features VALUES
    ('view.tracker', N'Tracker', N'Every release on its line, from the developers to live (Division)'),
    ('view.year', N'Year', N'The fiscal year at a glance'),
    ('view.quarter', N'Quarter', N'This quarter against the last'),
    ('view.month', N'Month', N'The month, day by day'),
    ('view.week', N'Week', N'This week'),
    ('drill.deployments', N'Deployments', N'Every build arriving at a stage, and every rollback'),
    ('drill.builds', N'Builds', N'Builds and the releases that claim them'),
    ('curate.queue', N'Needs you', N'Gaps waiting on a human word'),
    ('curate.associations', N'Associations', N'Claim builds for releases; correct what is linked to what'),
    ('curate.releases', N'Releases', N'Add and edit releases'),
    ('curate.feature-sets', N'Feature sets', N'What a release carries'),
    ('curate.events', N'Events', N'Approvals, holds, notes'),
    ('surface.moveit', N'Move It (link)', N'Link out to Move It'),
    ('surface.atlas', N'Atlas (link)', N'Link out to Atlas'),
    ('surface.estate', N'Estate (link)', N'Link out to the Estate'),
    ('surface.day', N'Day (link)', N'Link out to Day'),
    ('view.log-explorer', N'Log Explorer', N'Requests, exceptions and messages in the shared log tables'),
    ('view.trace', N'Trace', N'One identifier''s month, day and sessions in the shared log tables');

DECLARE @grants TABLE (Name varchar(100), RoleName varchar(100));
INSERT @grants VALUES
    ('view.tracker', 'executive'),
    ('view.tracker', 'product-owner'),
    ('view.tracker', 'application-owner'),
    ('view.tracker', 'technical-lead'),
    ('view.tracker', 'devops-lead'),
    ('view.tracker', 'application-administrator'),
    ('view.tracker', 'system-administrator'),
    ('view.year', 'executive'),
    ('view.year', 'product-owner'),
    ('view.year', 'application-owner'),
    ('view.year', 'system-administrator'),
    ('view.quarter', 'executive'),
    ('view.quarter', 'product-owner'),
    ('view.quarter', 'application-owner'),
    ('view.quarter', 'technical-lead'),
    ('view.quarter', 'devops-lead'),
    ('view.quarter', 'application-administrator'),
    ('view.quarter', 'system-administrator'),
    ('view.month', 'executive'),
    ('view.month', 'product-owner'),
    ('view.month', 'application-owner'),
    ('view.month', 'technical-lead'),
    ('view.month', 'devops-lead'),
    ('view.month', 'application-administrator'),
    ('view.month', 'system-administrator'),
    ('view.week', 'executive'),
    ('view.week', 'product-owner'),
    ('view.week', 'application-owner'),
    ('view.week', 'technical-lead'),
    ('view.week', 'devops-lead'),
    ('view.week', 'application-administrator'),
    ('view.week', 'system-administrator'),
    ('drill.deployments', 'technical-lead'),
    ('drill.deployments', 'devops-lead'),
    ('drill.deployments', 'application-administrator'),
    ('drill.deployments', 'system-administrator'),
    ('drill.builds', 'technical-lead'),
    ('drill.builds', 'devops-lead'),
    ('drill.builds', 'application-administrator'),
    ('drill.builds', 'system-administrator'),
    ('curate.queue', 'application-administrator'),
    ('curate.queue', 'system-administrator'),
    ('curate.associations', 'application-administrator'),
    ('curate.associations', 'system-administrator'),
    ('curate.releases', 'application-administrator'),
    ('curate.releases', 'system-administrator'),
    ('curate.feature-sets', 'application-administrator'),
    ('curate.feature-sets', 'system-administrator'),
    ('curate.events', 'application-administrator'),
    ('curate.events', 'system-administrator'),
    ('surface.moveit', 'executive'),
    ('surface.moveit', 'product-owner'),
    ('surface.moveit', 'application-owner'),
    ('surface.moveit', 'technical-lead'),
    ('surface.moveit', 'devops-lead'),
    ('surface.moveit', 'application-administrator'),
    ('surface.moveit', 'system-administrator'),
    ('surface.atlas', 'technical-lead'),
    ('surface.atlas', 'devops-lead'),
    ('surface.atlas', 'application-administrator'),
    ('surface.atlas', 'system-administrator'),
    ('surface.estate', 'technical-lead'),
    ('surface.estate', 'devops-lead'),
    ('surface.estate', 'application-administrator'),
    ('surface.estate', 'system-administrator'),
    ('surface.day', 'technical-lead'),
    ('surface.day', 'devops-lead'),
    ('surface.day', 'application-administrator'),
    ('surface.day', 'system-administrator'),
    ('view.log-explorer', 'system-administrator'),
    ('view.trace', 'system-administrator');

DECLARE @created TABLE (FeatureId int, Name varchar(100));

INSERT fm.Feature (Name, DisplayName, Description, IsEnabled, CreatedBy)
OUTPUT inserted.FeatureId, inserted.Name INTO @created
SELECT f.Name, f.DisplayName, f.Description, 1, 'census-seed'
FROM @features f
WHERE NOT EXISTS (SELECT 1 FROM fm.Feature x WHERE x.Name = f.Name AND x.IsVoided = 0);

INSERT fm.FeatureRole (FeatureId, RoleName, GrantedBy)
SELECT c.FeatureId, g.RoleName, 'census-seed'
FROM @created c
JOIN @grants g ON g.Name = c.Name;

INSERT fm.FeatureAudit (FeatureId, Action, PreviousValue, NewValue, ChangedBy)
SELECT c.FeatureId, 'seeded', NULL, fm.FeatureSnapshot(c.FeatureId), 'census-seed'
FROM @created c;

COMMIT;
