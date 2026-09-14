-- Q: Did anything reach PROD without approval, and is the PROD build the approved one? (App. A)
--
-- Four kinds of row:
--   awaiting deploy          - approved, and the approved build has never reached PROD
--   approved -> PROD         - approved, then deployed; DaysToDeploy is "theirs" made visible
--   deployed before approval - the build reached PROD before the approval was recorded (the
--                              emergency-by-phone case; fine once, a habit if it recurs)
--   PROD without approval    - an attributed build at PROD with no approval for it at all. Loud.
--   PROD build differs       - the release has an approval for build X but what is at PROD now,
--                              attributed to the same release, is build Y
--
-- Read-only.

WITH stg AS (
    SELECT Identifier AS Stage, Sort FROM core.SelectItem WHERE Grouping = 'Stage'
),
prod AS (SELECT Stage FROM stg WHERE Sort = (SELECT MAX(Sort) FROM stg)),
dep AS (
    SELECT d.ApplicationId, ep.Stage, d.Build, d.DetectedAt AS At, d.SupersededAt, 'observed' AS Evidence
    FROM health.Deployment d JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
    UNION ALL
    SELECT r.ApplicationId, e.Stage, e.Build, e.At,
           LEAD(e.At) OVER (PARTITION BY r.ApplicationId, e.Stage ORDER BY e.At, e.Id), 'asserted'
    FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
    WHERE e.Kind = 'deployed-asserted' AND e.Build IS NOT NULL AND e.Stage IS NOT NULL
),
prod_dep AS (
    SELECT dep.* FROM dep WHERE dep.Stage IN (SELECT Stage FROM prod)
),
approvals AS (
    SELECT e.ReleaseId, r.ApplicationId, r.Name, e.Build, e.At AS ApprovedAt, e.[By]
    FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
    WHERE e.Kind = 'approved' AND e.Build IS NOT NULL
),
attributed_prod AS (   -- attributed builds that reached PROD
    SELECT r.Id AS ReleaseId, r.ApplicationId, r.Name, rb.Build, MIN(pd.At) AS FirstProd, MAX(pd.Evidence) AS Evidence,
           MAX(CASE WHEN pd.SupersededAt IS NULL THEN 1 ELSE 0 END) AS IsCurrent
    FROM moveit.ReleaseBuild rb
    JOIN moveit.Release r ON r.Id = rb.ReleaseId
    JOIN prod_dep pd ON pd.ApplicationId = r.ApplicationId AND pd.Build = rb.Build
    GROUP BY r.Id, r.ApplicationId, r.Name, rb.Build
)
SELECT CASE WHEN ap.FirstProd IS NULL THEN 'awaiting deploy'
            WHEN ap.FirstProd < a.ApprovedAt THEN 'deployed before approval'
            ELSE 'approved -> PROD' END AS Item,
       a.ReleaseId, a.ApplicationId, a.Name, a.Build, a.ApprovedAt, a.[By], ap.FirstProd, ap.Evidence,
       DATEDIFF(day, a.ApprovedAt, ap.FirstProd) AS DaysToDeploy
FROM approvals a
LEFT JOIN attributed_prod ap ON ap.ReleaseId = a.ReleaseId AND ap.Build = a.Build

UNION ALL

SELECT 'PROD without approval', ap.ReleaseId, ap.ApplicationId, ap.Name, ap.Build, NULL, NULL, ap.FirstProd, ap.Evidence, NULL
FROM attributed_prod ap
WHERE NOT EXISTS (SELECT 1 FROM approvals a WHERE a.ReleaseId = ap.ReleaseId AND a.Build = ap.Build)

UNION ALL

SELECT 'PROD build differs', ap.ReleaseId, ap.ApplicationId, ap.Name, ap.Build, a.ApprovedAt, a.[By], ap.FirstProd, ap.Evidence, NULL
FROM attributed_prod ap
JOIN approvals a ON a.ReleaseId = ap.ReleaseId AND a.Build <> ap.Build
WHERE ap.IsCurrent = 1
  AND NOT EXISTS (SELECT 1 FROM approvals x WHERE x.ReleaseId = ap.ReleaseId AND x.Build = ap.Build)

ORDER BY Item, ApprovedAt DESC, FirstProd DESC;
