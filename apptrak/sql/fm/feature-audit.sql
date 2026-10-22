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
    SELECT CAST(NULL AS nvarchar(max));
