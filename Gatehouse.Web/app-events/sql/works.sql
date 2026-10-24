-- The units of work that started in a window (gatehouse.md §12.6), newest first, at most @Max: each one's kind, subject,
-- the systems it crossed, when it began and when it was last heard of, its last step, and what became of it:
--   failed     a step failed
--   completed  the application that created it reported it completed
--   stuck      its last step is a hand-off older than @StuckHours, with nothing received since
--   running    anything else
-- Optional filters: @Namespace, @CommandName, @Status. On the logs database; @Schema is Logs:Schema, built into the
-- statement, every value a parameter. Index: IX_AppEvent_WorkUid, IX_AppEvent_StartAt.

SET NOCOUNT ON;

IF OBJECT_ID(QUOTENAME(@Schema) + N'.[AppEvent]') IS NULL THROW 50404, N'The AppEvent table is not in this database under that schema (Logs:Schema).', 1;

DECLARE @q nvarchar(max) = REPLACE(N'
WITH started AS (
    SELECT WorkUid, MIN(StartAt) AS FirstAt
    FROM {s}.AppEvent
    WHERE WorkUid IS NOT NULL
    GROUP BY WorkUid
    HAVING MIN(StartAt) >= @From AND MIN(StartAt) < @To
), steps AS (
    SELECT e.WorkUid, e.Namespace, e.CommandName, e.CommandActivity, e.Application, e.StartAt, e.SubjectType, e.SubjectKey, e.Id,
           ROW_NUMBER() OVER (PARTITION BY e.WorkUid ORDER BY e.StartAt, e.Id) AS FirstRank,
           ROW_NUMBER() OVER (PARTITION BY e.WorkUid ORDER BY e.StartAt DESC, e.Id DESC) AS LastRank
    FROM {s}.AppEvent e
    JOIN started w ON w.WorkUid = e.WorkUid
), works AS (
    SELECT f.WorkUid, f.Namespace, f.CommandName, f.SubjectType, f.SubjectKey, f.Application AS StartedBy, f.StartAt AS FirstAt,
           l.StartAt AS LastAt, l.CommandActivity AS LastActivity, l.Application AS LastApplication,
           (SELECT COUNT(*) FROM steps x WHERE x.WorkUid = f.WorkUid) AS Events,
           (SELECT STRING_AGG(CONVERT(nvarchar(max), a.Application), N'', '')
            FROM (SELECT DISTINCT x.Application FROM steps x WHERE x.WorkUid = f.WorkUid) a) AS Applications,
           CASE
               WHEN EXISTS (SELECT 1 FROM steps x WHERE x.WorkUid = f.WorkUid AND x.CommandActivity = N''failed'') THEN N''failed''
               WHEN EXISTS (SELECT 1 FROM steps x WHERE x.WorkUid = f.WorkUid AND x.CommandActivity = N''completed'' AND x.Application = f.Application) THEN N''completed''
               WHEN l.CommandActivity = N''handed-off'' AND l.StartAt < DATEADD(hour, -@StuckHours, SYSDATETIMEOFFSET()) THEN N''stuck''
               ELSE N''running''
           END AS Status
    FROM steps f
    JOIN steps l ON l.WorkUid = f.WorkUid AND l.LastRank = 1
    WHERE f.FirstRank = 1
)
SELECT (
    SELECT TOP (@Max) w.WorkUid AS workUid, w.Namespace AS namespace, w.CommandName AS commandName, w.SubjectType AS subjectType,
           w.SubjectKey AS subjectKey, w.StartedBy AS startedBy, w.FirstAt AS firstAt, w.LastAt AS lastAt, w.LastActivity AS lastActivity,
           w.LastApplication AS lastApplication, w.Events AS events, w.Applications AS applications, w.Status AS status,
           DATEDIFF(second, w.FirstAt, w.LastAt) AS seconds
    FROM works w
    WHERE (@Namespace IS NULL OR w.Namespace = @Namespace) AND (@CommandName IS NULL OR w.CommandName = @CommandName)
      AND (@Status IS NULL OR w.Status = @Status)
    ORDER BY w.FirstAt DESC
    FOR JSON PATH, INCLUDE_NULL_VALUES
) AS JsonNode;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q,
    N'@From datetimeoffset, @To datetimeoffset, @Namespace nvarchar(50), @CommandName nvarchar(50), @Status nvarchar(20), @StuckHours int, @Max int',
    @From = @From, @To = @To, @Namespace = @Namespace, @CommandName = @CommandName, @Status = @Status, @StuckHours = @StuckHours, @Max = @Max;
