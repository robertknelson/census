-- Q: Did a stage ever go backwards? (App. A, architect)
--
-- A rollback is a deployment row whose build is OLDER than the build it replaced - "older" by
-- first-seen anywhere for the app, never by parsing the build string. A machine move (same
-- build, new box) is not a rollback and does not appear. Variant tells you whether the
-- pipeline stamped a fresh Deploymentat on the redeploy (A) or carried the original (B);
-- the fixtures have one of each because real behaviour is unknown (move-it.md 10.1).
--
-- Read-only.

WITH seen AS (
    SELECT ApplicationId, Build, MIN(DetectedAt) AS FirstSeen FROM health.Deployment GROUP BY ApplicationId, Build
)
SELECT d.ApplicationId, d.Application, ep.Stage, d.EndpointId,
       p.Build AS RolledBackFrom, sp.FirstSeen AS FromFirstSeen,
       d.Build AS RolledBackTo,   sd.FirstSeen AS ToFirstSeen,
       d.DetectedAt AS RolledBackAt,
       DATEDIFF(hour, p.DetectedAt, d.DetectedAt) AS HoursTheNewBuildLasted,
       CASE WHEN EXISTS (SELECT 1 FROM health.Deployment x
                         WHERE x.EndpointId = d.EndpointId AND x.Build = d.Build AND x.Id <> d.Id AND x.Deploymentat = d.Deploymentat)
            THEN 'B: original Deploymentat carried' ELSE 'A: fresh Deploymentat' END AS Variant,
       d.Branch
FROM health.Deployment d
JOIN health.Deployment p ON p.Id = d.PreviousId
JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
JOIN seen sd ON sd.ApplicationId = d.ApplicationId AND sd.Build = d.Build
JOIN seen sp ON sp.ApplicationId = p.ApplicationId AND sp.Build = p.Build
WHERE sd.FirstSeen < sp.FirstSeen
ORDER BY d.DetectedAt DESC;
