-- Every deployment the ledger holds of every build a release claims (move-it.md §29, his 13:
-- "ALL deployments of each build/stage (with date)"): observed rows from moveit.Deployment with
-- the build that superseded them on that endpoint, and asserted rows from deployed-asserted
-- events of the application's releases. For the release page. Read-only.
WITH obs AS (
    SELECT d.ApplicationId, d.EndpointId, ep.Stage, d.Machine, d.Build, d.DetectedAt, d.SupersededAt,
           LEAD(d.Build) OVER (PARTITION BY d.EndpointId ORDER BY d.DetectedAt, d.Id) AS SupersededBy
    FROM moveit.Deployment d
    JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
)
SELECT rb.ReleaseId, rb.Build, o.Stage, o.Machine, o.DetectedAt, o.SupersededAt, o.SupersededBy, 'observed' AS Evidence
FROM moveit.ReleaseBuild rb
JOIN moveit.Release r ON r.Id = rb.ReleaseId
JOIN obs o ON o.ApplicationId = r.ApplicationId AND o.Build = rb.Build

UNION ALL

SELECT rb.ReleaseId, rb.Build, e.Stage, NULL, e.At, NULL, NULL, 'asserted'
FROM moveit.ReleaseBuild rb
JOIN moveit.Release r ON r.Id = rb.ReleaseId
JOIN moveit.ReleaseEvent e ON e.Kind = 'deployed-asserted' AND e.Build = rb.Build AND e.Stage IS NOT NULL
JOIN moveit.Release re ON re.Id = e.ReleaseId AND re.ApplicationId = r.ApplicationId

ORDER BY ReleaseId, Build, DetectedAt, Machine;
