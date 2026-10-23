-- Gatehouse's copy of FM2280's feature-list.sql (gatehouse.md §6, G-R10). Read by the command/query handlers, which choose the
-- result's shape from the text: this script's answer is a real FOR JSON, so it is read as one JSON document.
-- The snapshots as one array under "features".

SELECT JSON_QUERY(COALESCE((
    SELECT '[' + STRING_AGG(CONVERT(nvarchar(max), fm.FeatureSnapshot(f.FeatureId)), ',') WITHIN GROUP (ORDER BY f.Name, f.FeatureId) + ']'
    FROM fm.Feature f
    WHERE @IncludeVoided = 1 OR f.IsVoided = 0), '[]')) AS features
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
