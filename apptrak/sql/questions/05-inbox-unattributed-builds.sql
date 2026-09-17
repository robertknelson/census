-- Q: What did we see that nobody has explained yet? (the inbox; move-it.md 5, App. A triage)
--
-- Three kinds of row, newest first:
--   attach a manifest     - a build observed at a promoted stage (past DEV) with no ReleaseBuild
--                           row for that app + build. Branch is a SUGGESTION for kind/attribution.
--   PROD without manifest - the same, at PROD: process debt, the one number that says whether
--                           the manual habit is holding.
--   attributed, unseen    - a build attributed to a release that has never been observed or
--                           asserted anywhere (typo, or an app that sends no block).
-- DEV churn is deliberately absent: DEV builds need no manifest.
--
-- Read-only.

WITH stg AS (
    SELECT x.Identifier AS Stage, x.Sort FROM core.SelectItem x
    JOIN core.SelectItem y ON y.Id = x.MasterId WHERE y.Identifier = 'stage' AND x.IsShow = 1
),
prod AS (SELECT MAX(Sort) AS Sort FROM stg),
seen_obs AS (
    SELECT d.ApplicationId, d.Application, ep.Stage, s.Sort, d.Build, d.Branch,
           MIN(d.DetectedAt) AS FirstSeen, MAX(CASE WHEN d.SupersededAt IS NULL THEN 1 ELSE 0 END) AS IsCurrent
    FROM moveit.Deployment d
    JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
    JOIN stg s ON s.Stage = ep.Stage
    GROUP BY d.ApplicationId, d.Application, ep.Stage, s.Sort, d.Build, d.Branch
),
attributed AS (
    SELECT r.ApplicationId, rb.Build, r.Id AS ReleaseId, r.Name
    FROM moveit.ReleaseBuild rb JOIN moveit.Release r ON r.Id = rb.ReleaseId
),
seen_any AS (
    SELECT ApplicationId, Build FROM moveit.Deployment
    UNION
    SELECT r.ApplicationId, e.Build FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
    WHERE e.Kind = 'deployed-asserted' AND e.Build IS NOT NULL
)
SELECT CASE WHEN so.Sort = prod.Sort THEN 'PROD without manifest' ELSE 'attach a manifest' END AS Item,
       so.ApplicationId, so.Application, so.Stage, so.Build, so.Branch,
       CASE WHEN so.Branch LIKE 'hotfix%' THEN 'hotfix' END AS SuggestedKind,
       so.FirstSeen, so.IsCurrent
FROM seen_obs so
CROSS JOIN prod
WHERE so.Sort > (SELECT MIN(Sort) FROM stg)
  AND NOT EXISTS (SELECT 1 FROM attributed a WHERE a.ApplicationId = so.ApplicationId AND a.Build = so.Build)

UNION ALL

SELECT 'attributed, unseen', a.ApplicationId, a.Name, NULL, a.Build, NULL, NULL, NULL, NULL
FROM attributed a
WHERE NOT EXISTS (SELECT 1 FROM seen_any s WHERE s.ApplicationId = a.ApplicationId AND s.Build = a.Build)

ORDER BY Item, FirstSeen DESC, ApplicationId, Build;
