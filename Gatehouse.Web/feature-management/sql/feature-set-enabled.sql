-- Gatehouse's copy of FM2280's feature-set-enabled.sql (gatehouse.md §6, G-R10). Read by the command/query handlers, which choose the
-- result's shape from the text: this script's answer is a real FOR JSON, so it is read as one JSON document.
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM fm.Feature WITH (UPDLOCK, HOLDLOCK) WHERE FeatureId = @FeatureId AND IsVoided = 0)
    THROW 50404, 'Feature not found.', 1;

DECLARE @Previous nvarchar(max) = fm.FeatureSnapshot(@FeatureId);

UPDATE fm.Feature
SET IsEnabled = @IsEnabled,
    ModifiedBy = @Actor,
    ModifiedAt = SYSUTCDATETIME()
WHERE FeatureId = @FeatureId
  AND CONVERT(bigint, RowVersion) = @RowVersion;

IF @@ROWCOUNT = 0
    THROW 50409, 'The feature was changed by someone else. Reload it and try again.', 1;

INSERT fm.FeatureAudit (FeatureId, Action, PreviousValue, NewValue, ChangedBy)
VALUES (@FeatureId, 'set-enabled', @Previous, fm.FeatureSnapshot(@FeatureId), @Actor);

COMMIT;

SELECT JSON_QUERY(fm.FeatureSnapshot(@FeatureId)) AS feature FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
