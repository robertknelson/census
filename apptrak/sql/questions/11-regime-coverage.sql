-- Q: Which apps still give no build evidence? (the health-regime rollout tracker; App. A triage)
--
-- Per application known to either side (endpoints or releases): endpoints registered, endpoints
-- that have ever produced a deployment row, the last evidence seen, and a verdict:
--   observed        - at least one endpoint reports a deployment block
--   pinged, no block - endpoints exist and answer, but never with a deployment block (Ledger)
--   asserted only   - no endpoints; movement known only from deployed-asserted events (Team A)
--   nothing         - releases exist, no endpoints, no assertions
-- Then the endpoint-level detail for anything not fully observed.
--
-- Read-only.

WITH apps AS (
    SELECT ApplicationId FROM health.HealthEndpoint
    UNION SELECT ApplicationId FROM moveit.Release
),
ep AS (
    SELECT e.ApplicationId, e.Id AS EndpointId, e.Identifier, e.Stage,
           (SELECT MAX(d.DetectedAt) FROM moveit.Deployment d WHERE d.EndpointId = e.Id) AS LastEvidence,
           (SELECT MAX(r.StartAt) FROM health.HealthReport r WHERE r.EndpointId = e.Id AND r.IsSuccess = 1) AS LastGoodPing
    FROM health.HealthEndpoint e
),
asr AS (
    SELECT r.ApplicationId, MAX(e.At) AS LastAsserted
    FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
    WHERE e.Kind = 'deployed-asserted' GROUP BY r.ApplicationId
)
SELECT a.ApplicationId,
       ISNULL((SELECT MAX(Application) FROM moveit.Deployment d WHERE d.ApplicationId = a.ApplicationId),
              (SELECT MAX(Application) FROM health.HealthReport r WHERE r.ApplicationId = a.ApplicationId)) AS Application,
       COUNT(ep.EndpointId) AS Endpoints,
       SUM(CASE WHEN ep.LastEvidence IS NOT NULL THEN 1 ELSE 0 END) AS EndpointsWithEvidence,
       MAX(ep.LastEvidence) AS LastEvidence,
       MAX(ep.LastGoodPing) AS LastGoodPing,
       asr.LastAsserted,
       CASE WHEN SUM(CASE WHEN ep.LastEvidence IS NOT NULL THEN 1 ELSE 0 END) > 0 THEN 'observed'
            WHEN COUNT(ep.EndpointId) > 0 THEN 'pinged, no block'
            WHEN asr.LastAsserted IS NOT NULL THEN 'asserted only'
            ELSE 'nothing' END AS Verdict
FROM apps a
LEFT JOIN ep  ON ep.ApplicationId = a.ApplicationId
LEFT JOIN asr ON asr.ApplicationId = a.ApplicationId
GROUP BY a.ApplicationId, asr.LastAsserted
ORDER BY Verdict, a.ApplicationId;

-- endpoint detail where evidence is missing
SELECT e.ApplicationId, e.Id AS EndpointId, e.Identifier, e.Stage,
       (SELECT MAX(r.StartAt) FROM health.HealthReport r WHERE r.EndpointId = e.Id AND r.IsSuccess = 1) AS LastGoodPing,
       CASE WHEN NOT EXISTS (SELECT 1 FROM health.HealthReport r WHERE r.EndpointId = e.Id AND r.IsSuccess = 1)
            THEN 'never answered' ELSE 'answers, no deployment block' END AS Gap
FROM health.HealthEndpoint e
WHERE NOT EXISTS (SELECT 1 FROM moveit.Deployment d WHERE d.EndpointId = e.Id)
ORDER BY e.ApplicationId, e.Stage;
