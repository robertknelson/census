SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM fm.Feature WITH (UPDLOCK, HOLDLOCK) WHERE FeatureId = @FeatureId AND IsVoided = 0)
    THROW 50404, 'Feature not found.', 1;

-- Revoking a role the feature doesn't have is a no-op: no audit.
IF EXISTS (SELECT 1 FROM fm.FeatureRole WHERE FeatureId = @FeatureId AND RoleName = @RoleName)
BEGIN
    DECLARE @Previous nvarchar(max) = fm.FeatureSnapshot(@FeatureId);

    DELETE fm.FeatureRole
    WHERE FeatureId = @FeatureId AND RoleName = @RoleName;

    UPDATE fm.Feature
    SET ModifiedBy = @Actor,
        ModifiedAt = SYSUTCDATETIME()
    WHERE FeatureId = @FeatureId;

    INSERT fm.FeatureAudit (FeatureId, Action, PreviousValue, NewValue, ChangedBy)
    VALUES (@FeatureId, 'role.revoke', @Previous, fm.FeatureSnapshot(@FeatureId), @Actor);
END

COMMIT;

SELECT fm.FeatureSnapshot(@FeatureId);
