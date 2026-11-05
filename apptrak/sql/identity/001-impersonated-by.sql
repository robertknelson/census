-- Impersonation (census-on-apptrak.md §10, D-005, CA-7): every audit row records the effective user in ChangedBy, as
-- before, and the real user in ImpersonatedBy when a system administrator was acting as someone else. NULL otherwise.
-- xf-dashboard's security review, Finding 1: without it an impersonated write is attributed to the target alone.
-- Nullable, so FM2280's and Gatehouse's writers, which do not know the column, keep working.
-- Idempotent. Run after the three audit tables exist. SQL Server 2019.

IF OBJECT_ID('moveit.EditAudit', 'U') IS NOT NULL AND COL_LENGTH('moveit.EditAudit', 'ImpersonatedBy') IS NULL
    ALTER TABLE moveit.EditAudit ADD ImpersonatedBy nvarchar(100) NULL;

IF OBJECT_ID('membership.MembershipAudit', 'U') IS NOT NULL AND COL_LENGTH('membership.MembershipAudit', 'ImpersonatedBy') IS NULL
    ALTER TABLE membership.MembershipAudit ADD ImpersonatedBy nvarchar(100) NULL;

IF OBJECT_ID('fm.FeatureAudit', 'U') IS NOT NULL AND COL_LENGTH('fm.FeatureAudit', 'ImpersonatedBy') IS NULL
    ALTER TABLE fm.FeatureAudit ADD ImpersonatedBy nvarchar(100) NULL;
