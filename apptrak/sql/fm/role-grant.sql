SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM fm.Feature WITH (UPDLOCK, HOLDLOCK) WHERE FeatureId = @FeatureId AND IsVoided = 0)
    THROW 50404, 'Feature not found.', 1;

-- Granting a role the feature already has is a no-op: no row, no audit.
IF NOT EXISTS (SELECT 1 FROM fm.FeatureRole WHERE FeatureId = @FeatureId AND RoleName = @RoleName)
BEGIN
    DECLARE @Previous nvarchar(max) = fm.FeatureSnapshot(@FeatureId);

    INSERT fm.FeatureRole (FeatureId, RoleName, GrantedBy)
    VALUES (@FeatureId, @RoleName, @Actor);

    UPDATE fm.Feature
    SET ModifiedBy = @Actor,
        ModifiedAt = SYSUTCDATETIME()
    WHERE FeatureId = @FeatureId;

    INSERT fm.FeatureAudit (FeatureId, Action, PreviousValue, NewValue, ChangedBy)
    VALUES (@FeatureId, 'role.grant', @Previous, fm.FeatureSnapshot(@FeatureId), @Actor);
END

COMMIT;

SELECT fm.FeatureSnapshot(@FeatureId);
