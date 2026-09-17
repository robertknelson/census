-- Q: Where is each release, what is in it, is it on hold, is it past target? (App. A, governance reader)
--
-- One row per release. Composition is DERIVED from work-item kinds (features only | fixes only |
-- mixed); Kind is the ASSERTED intent (featureset | hotfix). A hotfix that is 'mixed' is the
-- visible contradiction rule 2 promises. Highest stage uses the location rule from
-- 01-where-is-everything.sql applied across the release's work items.
--
-- Read-only.

WITH stg AS (
    SELECT x.Identifier AS Stage, x.Sort FROM core.SelectItem x
    JOIN core.SelectItem y ON y.Id = x.MasterId WHERE y.Identifier = 'stage' AND x.IsShow = 1
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
at_stage AS (
    SELECT c.WorkItemId, cur.Stage, cur.Sort, MIN(d.At) AS Since, MAX(cur.Evidence) AS Evidence
    FROM holds c
    JOIN dep d   ON d.ApplicationId = c.ApplicationId AND d.Build = c.Build
    JOIN cur     ON cur.ApplicationId = d.ApplicationId AND cur.Stage = d.Stage
                AND (cur.EndpointId = d.EndpointId OR (cur.EndpointId IS NULL AND d.EndpointId IS NULL))
    JOIN seen sc ON sc.ApplicationId = cur.ApplicationId AND sc.Build = cur.Build
    JOIN seen sd ON sd.ApplicationId = d.ApplicationId   AND sd.Build = d.Build
    WHERE sc.FirstSeen >= sd.FirstSeen
    GROUP BY c.WorkItemId, cur.Stage, cur.Sort
),
rel_stage AS (   -- the release's highest stage: the highest any of its work items reaches
    SELECT w.ReleaseId, MAX(a.Sort) AS Sort
    FROM moveit.WorkItem w JOIN at_stage a ON a.WorkItemId = w.Id
    GROUP BY w.ReleaseId
),
rel_since AS (   -- when the release first reached that stage
    SELECT w.ReleaseId, MIN(a.Since) AS Since, MAX(a.Evidence) AS Evidence
    FROM moveit.WorkItem w JOIN at_stage a ON a.WorkItemId = w.Id JOIN rel_stage rs ON rs.ReleaseId = w.ReleaseId AND rs.Sort = a.Sort
    GROUP BY w.ReleaseId
),
comp AS (
    SELECT ReleaseId,
           SUM(CASE WHEN Kind = 'feature' AND RemovedAt IS NULL THEN 1 ELSE 0 END) AS Features,
           SUM(CASE WHEN Kind = 'fix'     AND RemovedAt IS NULL THEN 1 ELSE 0 END) AS Fixes,
           SUM(CASE WHEN RemovedAt IS NOT NULL THEN 1 ELSE 0 END) AS Removed,
           SUM(CASE WHEN IncludedInBuild IS NULL AND RemovedAt IS NULL THEN 1 ELSE 0 END) AS WithDevs
    FROM moveit.WorkItem GROUP BY ReleaseId
),
ev AS (
    SELECT ReleaseId,
           MAX(CASE WHEN Kind = 'approved'  THEN At END) AS ApprovedAt,
           MAX(CASE WHEN Kind = 'approved'  THEN Build END) AS ApprovedBuild,
           MAX(CASE WHEN Kind = 'hold'      THEN At END) AS LastHoldAt,
           MAX(CASE WHEN Kind = 'resumed'   THEN At END) AS LastResumedAt,
           MAX(CASE WHEN Kind = 'abandoned' THEN At END) AS AbandonedAt
    FROM moveit.ReleaseEvent GROUP BY ReleaseId
),
hold_note AS (
    SELECT e.ReleaseId, e.Note
    FROM moveit.ReleaseEvent e JOIN ev ON ev.ReleaseId = e.ReleaseId AND e.Kind = 'hold' AND e.At = ev.LastHoldAt
)
SELECT r.Id AS ReleaseId, r.ApplicationId, r.Name, r.Kind,
       CASE WHEN c.Features > 0 AND c.Fixes > 0 THEN 'mixed'
            WHEN c.Features > 0 THEN 'features only'
            WHEN c.Fixes > 0    THEN 'fixes only'
            ELSE 'empty' END AS Composition,
       c.Features, c.Fixes, c.Removed, c.WithDevs,
       CASE WHEN ev.AbandonedAt IS NOT NULL THEN 'abandoned'
            WHEN s.Stage IS NOT NULL THEN s.Stage
            WHEN c.WithDevs > 0 THEN 'with the devs'
            ELSE 'no evidence' END AS HighestStage,
       rsn.Evidence, rsn.Since,
       CASE WHEN ev.LastHoldAt IS NOT NULL AND (ev.LastResumedAt IS NULL OR ev.LastResumedAt < ev.LastHoldAt) THEN 1 ELSE 0 END AS OnHold,
       hn.Note AS HoldReason,
       ev.ApprovedAt, ev.ApprovedBuild,
       r.TargetDate,
       CASE WHEN r.TargetDate < CAST(sysdatetimeoffset() AS date) AND ISNULL(s.Stage, '') <> 'PROD' AND ev.AbandonedAt IS NULL THEN 1 ELSE 0 END AS PastTarget,
       CASE WHEN r.Kind = 'hotfix' AND c.Features > 0 THEN 'hotfix carries a feature' END AS Contradiction
FROM moveit.Release r
LEFT JOIN comp c        ON c.ReleaseId = r.Id
LEFT JOIN rel_stage rs  ON rs.ReleaseId = r.Id
LEFT JOIN stg s         ON s.Sort = rs.Sort AND s.Stage = (SELECT TOP 1 Stage FROM stg x WHERE x.Sort = rs.Sort
                                                            AND EXISTS (SELECT 1 FROM moveit.WorkItem w JOIN at_stage a ON a.WorkItemId = w.Id WHERE w.ReleaseId = r.Id AND a.Stage = x.Stage))
LEFT JOIN rel_since rsn ON rsn.ReleaseId = r.Id
LEFT JOIN ev            ON ev.ReleaseId = r.Id
LEFT JOIN hold_note hn  ON hn.ReleaseId = r.Id
ORDER BY r.ApplicationId, r.Id;
