-- Q: How long does a release take, stage to stage, and how many VAL round-trips? (App. A, architect)
--
-- Per release with attributed builds:
--   FirstDev      - first time any attributed build was seen anywhere (DEV, normally)
--   FirstPreProd  - first arrival of an attributed build at the pre-PROD stage (VAL or UAT)
--   ApprovedAt    - the approval event
--   FirstProd     - first arrival of an attributed build at PROD (observed or asserted)
--   RoundTrips    - distinct attributed builds that reached the pre-PROD stage (testing iterations)
-- Days columns are the intervals; "ours" is FirstPreProd -> ApprovedAt, "theirs" is
-- ApprovedAt -> FirstProd, the distinction that protects the teams.
--
-- Read-only.

WITH stg AS (
    SELECT x.Identifier AS Stage, x.Sort FROM core.SelectItem x
    JOIN core.SelectItem y ON y.Id = x.MasterId WHERE y.Identifier = 'stage' AND x.IsShow = 1
),
prod AS (SELECT MAX(Sort) AS Sort FROM stg),
pre  AS (SELECT MAX(s.Sort) AS Sort FROM stg s CROSS JOIN prod WHERE s.Sort < prod.Sort),
dep AS (
    SELECT d.ApplicationId, ep.Stage, d.Build, d.DetectedAt AS At
    FROM moveit.Deployment d JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
    UNION ALL
    SELECT r.ApplicationId, e.Stage, e.Build, e.At
    FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
    WHERE e.Kind = 'deployed-asserted' AND e.Build IS NOT NULL AND e.Stage IS NOT NULL
),
rb AS (   -- the release's builds: attributed ones, plus each work item's first build (the sprint's real start)
    SELECT rb.ReleaseId, r.ApplicationId, rb.Build
    FROM moveit.ReleaseBuild rb JOIN moveit.Release r ON r.Id = rb.ReleaseId
    UNION
    SELECT w.ReleaseId, r.ApplicationId, w.IncludedInBuild
    FROM moveit.WorkItem w JOIN moveit.Release r ON r.Id = w.ReleaseId
    WHERE w.IncludedInBuild IS NOT NULL AND w.RemovedAt IS NULL
),
t AS (
    SELECT rb.ReleaseId,
           MIN(d.At) AS FirstDev,
           MIN(CASE WHEN s.Sort = pre.Sort  THEN d.At END) AS FirstPreProd,
           MIN(CASE WHEN s.Sort = prod.Sort THEN d.At END) AS FirstProd,
           COUNT(DISTINCT CASE WHEN s.Sort = pre.Sort THEN d.Build END) AS RoundTrips
    FROM rb
    JOIN dep d ON d.ApplicationId = rb.ApplicationId AND d.Build = rb.Build
    JOIN stg s ON s.Stage = d.Stage
    CROSS JOIN prod CROSS JOIN pre
    GROUP BY rb.ReleaseId
),
ap AS (
    SELECT ReleaseId, MIN(At) AS ApprovedAt FROM moveit.ReleaseEvent WHERE Kind = 'approved' GROUP BY ReleaseId
)
SELECT r.Id AS ReleaseId, r.ApplicationId, r.Name, r.Kind,
       t.FirstDev, t.FirstPreProd, ap.ApprovedAt, t.FirstProd, t.RoundTrips,
       DATEDIFF(day, t.FirstDev, t.FirstPreProd)     AS DaysDevToPreProd,
       DATEDIFF(day, t.FirstPreProd, ap.ApprovedAt)  AS DaysPreProdToApproval,
       DATEDIFF(day, ap.ApprovedAt, t.FirstProd)     AS DaysApprovalToProd,
       DATEDIFF(day, t.FirstDev, t.FirstProd)        AS DaysEndToEnd
FROM moveit.Release r
JOIN t ON t.ReleaseId = r.Id
LEFT JOIN ap ON ap.ReleaseId = r.Id
ORDER BY r.ApplicationId, t.FirstDev;
