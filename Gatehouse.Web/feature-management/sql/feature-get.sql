-- Gatehouse's copy of FM2280's feature-get.sql (gatehouse.md §6, G-R10). Read by the command/query handlers, which choose the
-- result's shape from the text: this script's answer is a real FOR JSON, so it is read as one JSON document.
-- No feature: an empty object, which the controller answers as 404.
SELECT JSON_QUERY(fm.FeatureSnapshot(@FeatureId)) AS feature FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
