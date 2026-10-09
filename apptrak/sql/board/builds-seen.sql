-- Every build the ledger has seen for each application, observed or asserted, with the
-- releases that claim it (move-it.md §29, his 18: "view builds not yet associated so they can
-- be added"). DEV-only builds are here on purpose — the inbox (05) leaves them out, the
-- release page wants them. One row per (application, build). Read-only.
WITH seen AS (
    SELECT d.ApplicationId, d.Build, ep.Stage, d.DetectedAt AS At,
           CASE WHEN d.SupersededAt IS NULL THEN 1 ELSE 0 END AS IsCurrent
    FROM moveit.Deployment d
    JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
    UNION ALL
    SELECT r.ApplicationId, e.Build, e.Stage, e.At, 0
    FROM moveit.ReleaseEvent e
    JOIN moveit.Release r ON r.Id = e.ReleaseId
    WHERE e.Kind = 'deployed-asserted' AND e.Build IS NOT NULL
),
builds AS (
    SELECT ApplicationId, Build, MIN(At) AS FirstSeen, MAX(At) AS LastSeen, MAX(IsCurrent) AS IsCurrent
    FROM seen GROUP BY ApplicationId, Build
)
SELECT b.ApplicationId, b.Build, b.FirstSeen, b.LastSeen, b.IsCurrent,
       (SELECT STRING_AGG(x.Stage, ', ') FROM (SELECT DISTINCT s.Stage FROM seen s WHERE s.ApplicationId = b.ApplicationId AND s.Build = b.Build) x) AS Stages,
       (SELECT STRING_AGG(r.Name, ', ') WITHIN GROUP (ORDER BY r.Id)
          FROM moveit.ReleaseBuild rb JOIN moveit.Release r ON r.Id = rb.ReleaseId
         WHERE r.ApplicationId = b.ApplicationId AND rb.Build = b.Build) AS ClaimedBy,
       (SELECT STRING_AGG(CAST(rb.ReleaseId AS varchar(10)), ',') WITHIN GROUP (ORDER BY rb.ReleaseId)
          FROM moveit.ReleaseBuild rb JOIN moveit.Release r ON r.Id = rb.ReleaseId
         WHERE r.ApplicationId = b.ApplicationId AND rb.Build = b.Build) AS ClaimedByIds
FROM builds b
ORDER BY b.ApplicationId, b.FirstSeen DESC, b.Build;
