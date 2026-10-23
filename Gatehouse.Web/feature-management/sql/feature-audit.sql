-- Gatehouse's copy of FM2280's feature-audit.sql (gatehouse.md §6, G-R10). Read by the command/query handlers, which choose the
-- result's shape from the text: this script's answer is a real FOR JSON, so it is read as one JSON document.
-- No feature: THROW 50404, which the handler turns into a 404 (FM2280 returned NULL).
IF EXISTS (SELECT 1 FROM fm.Feature WHERE FeatureId = @FeatureId)
    SELECT COALESCE((
        SELECT
            a.FeatureAuditId AS featureAuditId,
            a.Action AS [action],
            JSON_QUERY(a.PreviousValue) AS previousValue,
            JSON_QUERY(a.NewValue) AS newValue,
            a.ChangedBy AS changedBy,
            CONVERT(varchar(30), a.ChangedAt, 127) + 'Z' AS changedAt
        FROM fm.FeatureAudit a
        WHERE a.FeatureId = @FeatureId
        ORDER BY a.ChangedAt DESC, a.FeatureAuditId DESC
        FOR JSON PATH, INCLUDE_NULL_VALUES), '[]');
ELSE
    THROW 50404, 'Feature not found.', 1;
