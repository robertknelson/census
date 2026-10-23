-- Gatehouse's copy of FM2280's feature-definitions.sql (gatehouse.md §6, G-R10). Read by the command/query handlers, which choose the
-- result's shape from the text: this script's answer is a real FOR JSON, so it is read as one JSON document.
-- One JSON array instead of FM2280's two result sets: the command/query handlers read one result (xf-dashboard's
-- data-access.md: no multi-result-sets). Every live feature with its switch and the roles it is granted to.

SELECT f.Name AS name, f.IsEnabled AS isEnabled,
       JSON_QUERY(COALESCE((
           SELECT '[' + STRING_AGG(CONVERT(nvarchar(max), '"' + STRING_ESCAPE(fr.RoleName, 'json') + '"'), ',') + ']'
           FROM fm.FeatureRole fr
           WHERE fr.FeatureId = f.FeatureId), '[]')) AS roles
FROM fm.Feature f
WHERE f.IsVoided = 0
ORDER BY f.Name
FOR JSON PATH;
