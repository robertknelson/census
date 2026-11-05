-- Product owners and application owners add their own releases and features (census-on-apptrak.md §7, D-004):
-- curate.releases and curate.feature-sets granted to product-owner and application-owner. What a grant covers is still
-- the applications the role is held on: Census checks the feature per application, on the page and on the server.
--
-- Insert-only and idempotent: a grant that exists is left alone, and a grant revoked later on the feature access page
-- is not put back unless this file is run again. Each new grant is audited as the page would audit it. Runs on the real
-- AppTrak too (after 001-fm-schema.sql and 002-census-features.sql); it carries no demo data.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @grants TABLE (Name varchar(100), RoleName varchar(100));
INSERT @grants VALUES
    ('curate.releases', 'product-owner'),
    ('curate.releases', 'application-owner'),
    ('curate.feature-sets', 'product-owner'),
    ('curate.feature-sets', 'application-owner');

DECLARE @granted TABLE (FeatureId int, RoleName varchar(100), Previous nvarchar(max));

INSERT @granted (FeatureId, RoleName, Previous)
SELECT f.FeatureId, g.RoleName, fm.FeatureSnapshot(f.FeatureId)
FROM @grants g
JOIN fm.Feature f ON f.Name = g.Name AND f.IsVoided = 0
WHERE NOT EXISTS (SELECT 1 FROM fm.FeatureRole r WHERE r.FeatureId = f.FeatureId AND r.RoleName = g.RoleName);

INSERT fm.FeatureRole (FeatureId, RoleName, GrantedBy)
SELECT FeatureId, RoleName, 'census-seed' FROM @granted;

INSERT fm.FeatureAudit (FeatureId, Action, PreviousValue, NewValue, ChangedBy)
SELECT g.FeatureId, 'role.grant', g.Previous, fm.FeatureSnapshot(g.FeatureId), 'census-seed'
FROM @granted g;

COMMIT;

SELECT COUNT(*) AS Granted FROM @granted;
