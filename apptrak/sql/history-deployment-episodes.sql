-- FOR THE REAL ENVIRONMENT. Read-only. Run against the real AppTrak and bring the results
-- back (move-it.md open item 1). Nothing here can be answered from the fixtures.
--
-- Three questions:
--   A. What does a deployment episode look like in real data?
--   B. Does the release pipeline stamp a fresh Deploymentat when the same build redeploys
--      (rollback)? If any (endpoint, build) has more than one distinct Deploymentat, yes.
--   C. How much of the fleet reports a deployment block at all (regime coverage)?

SET NOCOUNT ON;

-- A. Episodes: consecutive pings sharing the deployment tuple, per endpoint.
;WITH q AS (
    SELECT r.EndpointId, r.Application, r.Stage, r.Machine, r.Build, r.BuildId, r.Branch, r.Deploymentat, r.StartAt,
           CASE WHEN LAG(ISNULL(r.Build,'') + '|' + ISNULL(r.BuildId,'') + '|' + r.Machine + '|' + ISNULL(r.Branch,'') + '|' + CONVERT(varchar(40), r.Deploymentat, 127))
                     OVER (PARTITION BY r.EndpointId ORDER BY r.StartAt, r.Id)
                  = ISNULL(r.Build,'') + '|' + ISNULL(r.BuildId,'') + '|' + r.Machine + '|' + ISNULL(r.Branch,'') + '|' + CONVERT(varchar(40), r.Deploymentat, 127)
                THEN 0 ELSE 1 END AS IsStart
    FROM health.HealthReport r
    WHERE r.IsSuccess = 1 AND r.HasContent = 1 AND r.Build IS NOT NULL
), g AS (
    SELECT q.*, SUM(q.IsStart) OVER (PARTITION BY q.EndpointId ORDER BY q.StartAt ROWS UNBOUNDED PRECEDING) AS Episode
    FROM q
)
SELECT g.EndpointId, e.Identifier, e.Stage AS RegisteredStage, g.Application, g.Stage AS ReportedStage,
       g.Machine, g.Build, g.BuildId, g.Branch, g.Deploymentat,
       MIN(g.StartAt) AS FirstSeen, MAX(g.StartAt) AS LastSeen, COUNT(*) AS Pings
FROM g
LEFT JOIN health.HealthEndpoint e ON e.Id = g.EndpointId
GROUP BY g.EndpointId, e.Identifier, e.Stage, g.Application, g.Stage, g.Machine, g.Build, g.BuildId, g.Branch, g.Deploymentat, g.Episode
ORDER BY g.Application, e.Stage, FirstSeen;

-- B. Same build, more than one Deploymentat at one endpoint => the pipeline stamps fresh on redeploy.
SELECT r.EndpointId, r.Application, r.Stage, r.Build,
       COUNT(DISTINCT r.Deploymentat) AS DistinctDeploymentat,
       MIN(r.Deploymentat) AS FirstDeploymentat, MAX(r.Deploymentat) AS LastDeploymentat
FROM health.HealthReport r
WHERE r.Build IS NOT NULL
GROUP BY r.EndpointId, r.Application, r.Stage, r.Build
HAVING COUNT(DISTINCT r.Deploymentat) > 1
ORDER BY r.Application, r.Stage, r.Build;

-- C. Regime coverage: pings with and without a deployment block, per endpoint.
SELECT r.EndpointId, e.Identifier, e.Stage, r.Application,
       SUM(CASE WHEN r.Build IS NOT NULL THEN 1 ELSE 0 END) AS WithBlock,
       SUM(CASE WHEN r.Build IS NULL     THEN 1 ELSE 0 END) AS WithoutBlock,
       MIN(r.StartAt) AS FirstPing, MAX(r.StartAt) AS LastPing
FROM health.HealthReport r
LEFT JOIN health.HealthEndpoint e ON e.Id = r.EndpointId
GROUP BY r.EndpointId, e.Identifier, e.Stage, r.Application
ORDER BY r.Application, e.Stage;
