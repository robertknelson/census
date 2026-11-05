-- Each document held in the database: its rows and when it last changed (census-on-apptrak.md §6).
SET NOCOUNT ON;
SELECT Document, COUNT(*) AS Rows, MAX(UpdatedAt) AS UpdatedAt
FROM census.Assertion
GROUP BY Document
ORDER BY Document;
