-- Q: Is any dependent feature ahead of the thing it depends on? (App. A, architect; rule 7)
--
-- The microservices wound: gateway in PROD, downstream still in VAL. Two kinds of row:
--   current    - right now, the dependent work item is at a higher stage than its dependency
--   historical - at some stage, the dependent arrived before its dependency did (DaysAhead)
-- Only dependsOn links are directional; relatedTo never violates.
--
-- Read-only.

WITH stg AS (
    SELECT x.Identifier AS Stage, x.Sort FROM core.SelectItem x
    JOIN core.SelectItem y ON y.Id = x.MasterId WHERE y.Identifier = 'stages' AND x.IsShow = 1
      AND (EXISTS (SELECT 1 FROM health.HealthEndpoint he WHERE he.Stage = x.Identifier)      -- only stages seen:
           OR EXISTS (SELECT 1 FROM moveit.ReleaseEvent re WHERE re.Stage = x.Identifier))  -- registered or asserted
),
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
first_at AS (   -- when each work item first arrived at each stage (ever)
    SELECT c.WorkItemId, d.Stage, s.Sort, MIN(d.At) AS FirstAt
    FROM holds c JOIN dep d ON d.ApplicationId = c.ApplicationId AND d.Build = c.Build JOIN stg s ON s.Stage = d.Stage
    GROUP BY c.WorkItemId, d.Stage, s.Sort
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
    SELECT WorkItemId, Stage, Sort, ROW_NUMBER() OVER (PARTITION BY WorkItemId ORDER BY Sort DESC) AS rn FROM at_stage
),
links AS (
    SELECT l.Id AS LinkId, l.WorkItemId, l.LinkedWorkItemId, l.Note,
           wd.Title AS Dependent, rd.ApplicationId AS DependentApp,
           wt.Title AS DependsOn,  rt.ApplicationId AS DependsOnApp
    FROM moveit.WorkItemLink l
    JOIN moveit.WorkItem wd ON wd.Id = l.WorkItemId       JOIN moveit.Release rd ON rd.Id = wd.ReleaseId
    JOIN moveit.WorkItem wt ON wt.Id = l.LinkedWorkItemId JOIN moveit.Release rt ON rt.Id = wt.ReleaseId
    WHERE l.Kind = 'dependsOn'
)
SELECT 'current' AS Violation, k.LinkId, k.DependentApp, k.Dependent, bd.Stage AS DependentStage,
       k.DependsOnApp, k.DependsOn, ISNULL(bt.Stage, 'nowhere') AS DependsOnStage,
       NULL AS Stage, NULL AS DaysAhead, k.Note
FROM links k
JOIN best bd ON bd.WorkItemId = k.WorkItemId AND bd.rn = 1
LEFT JOIN best bt ON bt.WorkItemId = k.LinkedWorkItemId AND bt.rn = 1
WHERE bd.Sort > ISNULL(bt.Sort, 0)

UNION ALL

SELECT 'historical', k.LinkId, k.DependentApp, k.Dependent, NULL,
       k.DependsOnApp, k.DependsOn, NULL,
       fd.Stage, DATEDIFF(day, fd.FirstAt, ft.FirstAt), k.Note
FROM links k
JOIN first_at fd ON fd.WorkItemId = k.WorkItemId
JOIN first_at ft ON ft.WorkItemId = k.LinkedWorkItemId AND ft.Stage = fd.Stage
WHERE fd.FirstAt < ft.FirstAt
ORDER BY Violation, LinkId, Stage;
