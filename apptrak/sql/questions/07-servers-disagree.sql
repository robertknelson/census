-- Q: Do all servers in one stage agree on the build? (move-it.md 6, multi-server; App. A)
--
-- Two result sets:
--   1. now       - app + stage with more than one endpoint and more than one current build
--   2. history   - every window in which two endpoints of one app + stage served different
--                  builds at the same time (a partial deploy), with its duration
-- One server per stage for eight years means this is usually empty; the fixtures include one
-- day of disagreement on WidgetCore PROD so the shape is proven.
--
-- Read-only.

WITH cur AS (
    SELECT d.ApplicationId, d.Application, ep.Stage, d.EndpointId, ep.Identifier, d.Build, d.DetectedAt
    FROM health.Deployment d JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
    WHERE d.SupersededAt IS NULL
),
groups AS (
    SELECT ApplicationId, Stage
    FROM cur GROUP BY ApplicationId, Stage
    HAVING COUNT(*) > 1 AND COUNT(DISTINCT Build) > 1
)
SELECT c.ApplicationId, c.Application, c.Stage, c.EndpointId, c.Identifier, c.Build, c.DetectedAt AS Since
FROM cur c JOIN groups g ON g.ApplicationId = c.ApplicationId AND g.Stage = c.Stage
ORDER BY c.ApplicationId, c.Stage, c.EndpointId;

-- history: overlapping deployment intervals on different endpoints, same app + stage, different builds
SELECT a.ApplicationId, a.Application, ea.Stage,
       a.EndpointId AS EndpointA, a.Build AS BuildA,
       b.EndpointId AS EndpointB, b.Build AS BuildB,
       CASE WHEN a.DetectedAt > b.DetectedAt THEN a.DetectedAt ELSE b.DetectedAt END AS DisagreeFrom,
       CASE WHEN ISNULL(a.SupersededAt, '9999-12-31') < ISNULL(b.SupersededAt, '9999-12-31') THEN a.SupersededAt ELSE b.SupersededAt END AS DisagreeTo,
       DATEDIFF(hour,
           CASE WHEN a.DetectedAt > b.DetectedAt THEN a.DetectedAt ELSE b.DetectedAt END,
           ISNULL(CASE WHEN ISNULL(a.SupersededAt, '9999-12-31') < ISNULL(b.SupersededAt, '9999-12-31') THEN a.SupersededAt ELSE b.SupersededAt END, sysdatetimeoffset())) AS Hours
FROM health.Deployment a
JOIN health.HealthEndpoint ea ON ea.Id = a.EndpointId
JOIN health.Deployment b     ON b.ApplicationId = a.ApplicationId AND b.EndpointId > a.EndpointId
JOIN health.HealthEndpoint eb ON eb.Id = b.EndpointId AND eb.Stage = ea.Stage
WHERE a.Build <> b.Build
  AND a.DetectedAt < ISNULL(b.SupersededAt, '9999-12-31')
  AND b.DetectedAt < ISNULL(a.SupersededAt, '9999-12-31')
ORDER BY a.ApplicationId, ea.Stage, DisagreeFrom;
