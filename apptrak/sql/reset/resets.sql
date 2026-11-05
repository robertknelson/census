-- The resets so far, newest first, with how many rows each took.
SET NOCOUNT ON;
SELECT r.ResetId, r.At, r.[By], r.Reason, r.RestoredAt, r.RestoredBy,
       ISNULL((SELECT SUM(s.RowsTaken) FROM reset.Snapshot s WHERE s.ResetId = r.ResetId), 0) AS RowsTaken
FROM reset.Reset r
ORDER BY r.ResetId DESC;
