SELECT f.FeatureId, f.Name, f.IsEnabled
FROM fm.Feature f
WHERE f.IsVoided = 0;

SELECT fr.FeatureId, fr.RoleName
FROM fm.FeatureRole fr
INNER JOIN fm.Feature f ON f.FeatureId = fr.FeatureId
WHERE f.IsVoided = 0;
