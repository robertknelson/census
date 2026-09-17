-- Q: Where is every feature and fix right now? (the governance reader's board; move-it.md App. A)
--
-- One row per work item: its release, app, kind, and Status:
--   with the devs   - no first build yet
--   removed         - pulled from the release
--   no evidence     - the app reports no deployment block and has no asserted deployments
--   not deployed    - its build is known but has not been seen at any stage
--   <STAGE>         - highest stage a containing build is at now (Evidence: observed | asserted)
--
-- THE LOCATION RULE (move-it.md 10.2 rule 5, refined 2026-09-14):
--   a work item is at stage S if some build containing it was ever deployed at S, and the
--   build at S now is not OLDER than that build - "older" meaning first seen anywhere for the
--   app, from evidence, never from parsing the build string. A rollback puts an older build
--   back, so the item leaves S; a later build (next sprint, a hotfix branched from PROD)
--   carries it forward. Reverts are explicit: WorkItem.RemovedAt.
--   A build "holds" a work item when it is attributed to the item's release
--   (ReleaseBuild) and is not older than the item's IncludedInBuild.
--
-- Multi-server: at S if at least one server there has it; 07-servers-disagree.sql flags
-- the partial deploy itself.
--
-- Optional filter: set @WorkItemId. Read-only.

DECLARE @WorkItemId int = NULL;

WITH stg AS (
    SELECT x.Identifier AS Stage, x.Sort FROM core.SelectItem x
    JOIN core.SelectItem y ON y.Id = x.MasterId WHERE y.Identifier = 'stages' AND x.IsShow = 1
),
dep AS (   -- every deployment at a stage, observed or asserted; asserted rows have no EndpointId
    SELECT d.ApplicationId, d.EndpointId, ep.Stage, d.Build, d.DetectedAt AS At, d.SupersededAt, 'observed' AS Evidence
    FROM moveit.Deployment d JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
    UNION ALL
    SELECT r.ApplicationId, NULL, e.Stage, e.Build, e.At,
           LEAD(e.At) OVER (PARTITION BY r.ApplicationId, e.Stage ORDER BY e.At, e.Id), 'asserted'
    FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
    WHERE e.Kind = 'deployed-asserted' AND e.Build IS NOT NULL AND e.Stage IS NOT NULL
),
seen AS (  -- the app's build order: when each build was first seen anywhere
    SELECT ApplicationId, Build, MIN(At) AS FirstSeen FROM dep GROUP BY ApplicationId, Build
),
cur AS (   -- what is at each stage now
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
    SELECT c.WorkItemId, cur.Stage, cur.Sort, MIN(d.At) AS Since, MAX(cur.Evidence) AS Evidence   -- Since = first arrival at the stage, not the current build's
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
    SELECT WorkItemId, Stage, Since, Evidence,
           ROW_NUMBER() OVER (PARTITION BY WorkItemId ORDER BY Sort DESC, Evidence DESC) AS rn
    FROM at_stage
)
SELECT w.Id AS WorkItemId, r.ApplicationId, r.Id AS ReleaseId, r.Name AS [Release], r.Kind AS ReleaseKind,
       w.Kind, w.Title, w.BuiltBy, w.ExternalRef, w.IncludedInBuild,
       CASE
           WHEN w.RemovedAt IS NOT NULL      THEN 'removed'
           WHEN w.IncludedInBuild IS NULL    THEN 'with the devs'
           WHEN b.Stage IS NOT NULL          THEN b.Stage
           WHEN NOT EXISTS (SELECT 1 FROM dep WHERE dep.ApplicationId = r.ApplicationId) THEN 'no evidence'
           ELSE 'not deployed'
       END AS Status,
       b.Evidence, b.Since,
       DATEDIFF(day, b.Since, sysdatetimeoffset()) AS DaysThere
FROM moveit.WorkItem w
JOIN moveit.Release r ON r.Id = w.ReleaseId
LEFT JOIN best b ON b.WorkItemId = w.Id AND b.rn = 1
WHERE @WorkItemId IS NULL OR w.Id = @WorkItemId
ORDER BY r.ApplicationId, r.Id, w.Id;
