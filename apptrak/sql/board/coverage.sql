-- How much of the division the board can see (move-it.md §24): one row per application known
-- to either side, with 11's verdict. 11's rule verbatim — change both together — without 11's
-- last-good-ping lookup, which scans health.HealthReport and took 59 s on real data (item 16).
--   observed          - at least one endpoint has produced a deployment row
--   pinged, no block  - endpoints registered, none has produced a deployment row
--   asserted only     - no endpoints; movement known only from deployed-asserted events
--   nothing           - releases exist, no endpoints, no assertions
-- Read-only.

WITH apps AS (
    SELECT ApplicationId FROM health.HealthEndpoint
    UNION SELECT ApplicationId FROM moveit.Release
),
ep AS (
    SELECT e.ApplicationId, e.Id AS EndpointId,
           CASE WHEN EXISTS (SELECT 1 FROM moveit.Deployment d WHERE d.EndpointId = e.Id) THEN 1 ELSE 0 END AS HasEvidence
    FROM health.HealthEndpoint e
),
asr AS (
    SELECT DISTINCT r.ApplicationId
    FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
    WHERE e.Kind = 'deployed-asserted'
)
SELECT a.ApplicationId,
       COUNT(ep.EndpointId) AS Endpoints,
       ISNULL(SUM(ep.HasEvidence), 0) AS EndpointsWithEvidence,
       CASE WHEN SUM(ep.HasEvidence) > 0 THEN 'observed'
            WHEN COUNT(ep.EndpointId) > 0 THEN 'pinged, no block'
            WHEN MAX(asr.ApplicationId) IS NOT NULL THEN 'asserted only'
            ELSE 'nothing' END AS Verdict
FROM apps a
LEFT JOIN ep  ON ep.ApplicationId = a.ApplicationId
LEFT JOIN asr ON asr.ApplicationId = a.ApplicationId
GROUP BY a.ApplicationId
ORDER BY a.ApplicationId;
