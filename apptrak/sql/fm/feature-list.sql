SELECT '[' + COALESCE(STRING_AGG(CONVERT(nvarchar(max), fm.FeatureSnapshot(f.FeatureId)), ',')
                     WITHIN GROUP (ORDER BY f.Name, f.FeatureId), '') + ']'
FROM fm.Feature f
WHERE @IncludeVoided = 1 OR f.IsVoided = 0;
