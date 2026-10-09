-- Q: Which releases are ready for the client meeting? (App. A, architect; rule 7)
--
-- A release is a candidate when it has reached a pre-PROD stage (VAL or UAT), has no approval
-- yet, is not on hold or abandoned. It is READY when every depends-on target of its work items
-- is at least as far along. Blockers lists the dependencies that are not.
--
-- Read-only.

WITH stg AS (
    SELECT x.Identifier AS Stage, x.Sort FROM core.SelectItem x
    JOIN core.SelectItem y ON y.Id = x.MasterId WHERE y.Identifier = 'stages' AND x.IsShow = 1
      AND (EXISTS (SELECT 1 FROM health.HealthEndpoint he WHERE he.Stage = x.Identifier)      -- only stages seen:
           OR EXISTS (SELECT 1 FROM moveit.ReleaseEvent re WHERE re.Stage = x.Identifier))  -- registered or asserted
),
prod AS (SELECT MAX(Sort) AS Sort FROM stg),
dep AS (
    SELECT d.ApplicationId, d.EndpointId, ep.Stage, d.Build, d.DetectedAt AS At, d.SupersededAt, 'observed' AS Evidence
    FROM moveit.Deployment d JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
    UNION ALL
    SELECT r.ApplicationId, NULL, e.Stage, e.Build, e.At,
           LEAD(e.At) OVER (PARTITION BY r.ApplicationId, e.Stage ORDER BY e.At, e.Id), 'asserted'
    FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
    WHERE e.Kind = 'deployed-asserted' AND e.Build IS NOT NULL AND e.Stage IS NOT NULL
),
seen AS (
    SELECT ApplicationId, Build, MIN(At) AS FirstSeen FROM dep GROUP BY ApplicationId, Build
),
cur AS (
    SELECT dep.*, s.Sort FROM dep JOIN stg s ON s.Stage = dep.Stage WHERE dep.SupersededAt IS NULL
),
holds AS (
    SELECT r.ApplicationId, rb.Build, w.Id AS WorkItemId
    FROM moveit.ReleaseBuild rb
    JOIN moveit.Release r  ON r.Id = rb.ReleaseId
    JOIN moveit.WorkItem w ON w.ReleaseId = r.Id AND w.RemovedAt IS NULL AND w.IncludedInBuild IS NOT NULL
    LEFT JOIN seen sb ON sb.ApplicationId = r.ApplicationId AND sb.Build = rb.Build
    LEFT JOIN seen sw ON sw.ApplicationId = r.ApplicationId AND sw.Build = w.IncludedInBuild
    WHERE w.IncludedInBuild = rb.Build
       OR (sw.FirstSeen IS NOT NULL AND sb.FirstSeen IS NOT NULL AND sw.FirstSeen <= sb.FirstSeen)
),
at_stage AS (
    SELECT c.WorkItemId, cur.Stage, cur.Sort
    FROM holds c
    JOIN dep d   ON d.ApplicationId = c.ApplicationId AND d.Build = c.Build
    JOIN cur     ON cur.ApplicationId = d.ApplicationId AND cur.Stage = d.Stage
                AND (cur.EndpointId = d.EndpointId OR (cur.EndpointId IS NULL AND d.EndpointId IS NULL))
    JOIN seen sc ON sc.ApplicationId = cur.ApplicationId AND sc.Build = cur.Build
    JOIN seen sd ON sd.ApplicationId = d.ApplicationId   AND sd.Build = d.Build
    WHERE sc.FirstSeen >= sd.FirstSeen
    GROUP BY c.WorkItemId, cur.Stage, cur.Sort
),
best AS (
    SELECT WorkItemId, Stage, Sort, ROW_NUMBER() OVER (PARTITION BY WorkItemId ORDER BY Sort DESC, Stage) AS rn FROM at_stage
),
rel AS (   -- release's highest stage
    SELECT w.ReleaseId, MAX(b.Sort) AS Sort
    FROM moveit.WorkItem w JOIN best b ON b.WorkItemId = w.Id AND b.rn = 1
    GROUP BY w.ReleaseId
),
ev AS (
    SELECT ReleaseId,
           MAX(CASE WHEN Kind = 'approved'  THEN At END) AS ApprovedAt,
           MAX(CASE WHEN Kind = 'hold'      THEN At END) AS LastHoldAt,
           MAX(CASE WHEN Kind = 'resumed'   THEN At END) AS LastResumedAt,
           MAX(CASE WHEN Kind = 'abandoned' THEN At END) AS AbandonedAt
    FROM moveit.ReleaseEvent GROUP BY ReleaseId
),
blockers AS (   -- dependencies below the release's own stage
    SELECT w.ReleaseId, l.LinkedWorkItemId, wt.Title, ISNULL(bt.Stage, 'nowhere') AS Stage
    FROM moveit.WorkItem w
    JOIN moveit.WorkItemLink l ON l.WorkItemId = w.Id AND l.Kind = 'depends-on'
    JOIN moveit.WorkItem wt ON wt.Id = l.LinkedWorkItemId
    JOIN rel ON rel.ReleaseId = w.ReleaseId
    LEFT JOIN best bt ON bt.WorkItemId = l.LinkedWorkItemId AND bt.rn = 1
    WHERE w.RemovedAt IS NULL AND ISNULL(bt.Sort, 0) < rel.Sort
)
SELECT r.Id AS ReleaseId, r.ApplicationId, r.Name, r.Kind, s.Stage AS AtStage,
       CASE WHEN NOT EXISTS (SELECT 1 FROM blockers b WHERE b.ReleaseId = r.Id) THEN 1 ELSE 0 END AS Ready,
       (SELECT STRING_AGG(CONCAT(b.Title, ' (', b.Stage, ')'), '; ') FROM blockers b WHERE b.ReleaseId = r.Id) AS Blockers,
       r.TargetDate
FROM moveit.Release r
JOIN rel  ON rel.ReleaseId = r.Id
JOIN prod ON 1 = 1
JOIN stg s ON s.Sort = rel.Sort AND EXISTS (SELECT 1 FROM moveit.WorkItem w JOIN best b ON b.WorkItemId = w.Id AND b.rn = 1 WHERE w.ReleaseId = r.Id AND b.Stage = s.Stage)
LEFT JOIN ev ON ev.ReleaseId = r.Id
WHERE rel.Sort < prod.Sort
  AND rel.Sort > (SELECT MIN(Sort) FROM stg)                       -- past DEV
  AND ev.ApprovedAt IS NULL
  AND ev.AbandonedAt IS NULL
  AND NOT (ev.LastHoldAt IS NOT NULL AND (ev.LastResumedAt IS NULL OR ev.LastResumedAt < ev.LastHoldAt))
ORDER BY Ready DESC, r.TargetDate, r.Id;
