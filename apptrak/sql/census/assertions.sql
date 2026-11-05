-- One document's rows, in its order (census-on-apptrak.md §6). Parameter: @Document.
SET NOCOUNT ON;
SELECT EntityKey, Value
FROM census.Assertion
WHERE Document = @Document
ORDER BY Sort, EntityKey;
