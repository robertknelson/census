SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM fm.Feature WITH (UPDLOCK, HOLDLOCK) WHERE FeatureId = @FeatureId AND IsVoided = 0)
    THROW 50404, 'Feature not found.', 1;

DECLARE @Previous nvarchar(max) = fm.FeatureSnapshot(@FeatureId);

UPDATE fm.Feature
SET IsVoided = 1,
    VoidedBy = @Actor,
    VoidedAt = SYSUTCDATETIME(),
    VoidReason = @Reason
WHERE FeatureId = @FeatureId
  AND CONVERT(bigint, RowVersion) = @RowVersion;

IF @@ROWCOUNT = 0
    THROW 50409, 'The feature was changed by someone else. Reload it and try again.', 1;

INSERT fm.FeatureAudit (FeatureId, Action, PreviousValue, NewValue, ChangedBy, ImpersonatedBy)
VALUES (@FeatureId, 'void', @Previous, fm.FeatureSnapshot(@FeatureId), @Actor, @ImpersonatedBy);

COMMIT;

SELECT fm.FeatureSnapshot(@FeatureId);
