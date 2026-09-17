-- Q: How many hotfixes, what escaped to PROD, and what was mid-flight when they landed? (App. A)
--
-- Two result sets:
--   1. hotfix releases - each with its fixes, where the defect was found, when it reached PROD,
--      and the featureset release of the same app that was in progress at that moment
--      (started before, not yet in PROD) - the interleave.
--   2. escaped defects - fixes by app and FoundInStage; PROD vs the rest is the quality-of-
--      testing metric.
--
-- Read-only.

WITH stg AS (
    SELECT x.Identifier AS Stage, x.Sort FROM core.SelectItem x
    JOIN core.SelectItem y ON y.Id = x.MasterId WHERE y.Identifier = 'stage' AND x.IsShow = 1
),
prod AS (SELECT MAX(Sort) AS Sort FROM stg),
dep AS (
    SELECT d.ApplicationId, ep.Stage, d.Build, d.DetectedAt AS At
    FROM moveit.Deployment d JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
    UNION ALL
    SELECT r.ApplicationId, e.Stage, e.Build, e.At
    FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
    WHERE e.Kind = 'deployed-asserted' AND e.Build IS NOT NULL AND e.Stage IS NOT NULL
),
rb AS (   -- the release's builds: attributed ones, plus each work item's first build (the sprint's real start)
    SELECT rb.ReleaseId, rb.Build FROM moveit.ReleaseBuild rb
    UNION
    SELECT w.ReleaseId, w.IncludedInBuild FROM moveit.WorkItem w WHERE w.IncludedInBuild IS NOT NULL AND w.RemovedAt IS NULL
),
rel_t AS (   -- per release: first seen anywhere, first at PROD
    SELECT r.Id AS ReleaseId, r.ApplicationId, r.Name, r.Kind,
           MIN(d.At) AS FirstSeen,
           MIN(CASE WHEN s.Sort = prod.Sort THEN d.At END) AS FirstProd
    FROM moveit.Release r
    JOIN rb ON rb.ReleaseId = r.Id
    LEFT JOIN dep d ON d.ApplicationId = r.ApplicationId AND d.Build = rb.Build
    LEFT JOIN stg s ON s.Stage = d.Stage
    CROSS JOIN prod
    GROUP BY r.Id, r.ApplicationId, r.Name, r.Kind
)
SELECT h.ReleaseId, h.ApplicationId, h.Name AS Hotfix,
       (SELECT STRING_AGG(CONCAT(w.Title, ' [found in ', ISNULL(w.FoundInStage, '?'), ']'), '; ')
          FROM moveit.WorkItem w WHERE w.ReleaseId = h.ReleaseId AND w.RemovedAt IS NULL) AS Fixes,
       h.FirstProd AS HotfixInProdAt,
       f.Name AS InterruptedRelease,
       DATEDIFF(day, f.FirstSeen, h.FirstProd) AS DaysIntoThatRelease
FROM rel_t h
LEFT JOIN rel_t f ON f.ApplicationId = h.ApplicationId AND f.Kind = 'featureset'
                 AND f.FirstSeen < h.FirstProd
                 AND (f.FirstProd IS NULL OR f.FirstProd > h.FirstProd)
WHERE h.Kind = 'hotfix'
ORDER BY h.FirstProd DESC;

-- escaped defects: where fixes' defects were found, per app
SELECT r.ApplicationId, w.FoundInStage,
       COUNT(*) AS Fixes,
       SUM(CASE WHEN r.Kind = 'hotfix' THEN 1 ELSE 0 END) AS ViaHotfix
FROM moveit.WorkItem w
JOIN moveit.Release r ON r.Id = w.ReleaseId
WHERE w.Kind = 'fix' AND w.RemovedAt IS NULL
GROUP BY r.ApplicationId, w.FoundInStage
ORDER BY r.ApplicationId, w.FoundInStage;
