-- The ledger as the entry page reads it (move-it.md §15): every deployment moveit.Deployment
-- found, newest first, with whether any release claims its build. An unclaimed build past
-- DEV is the inbox (05), drawn in place. Read-only.

SELECT d.Id AS DeploymentId, d.ApplicationId, d.Application, d.EndpointId,
       ep.Stage, d.ReportedStage, d.Machine, d.Build, d.Branch, d.Version,
       d.Deploymentat, d.DetectedAt, d.SupersededAt,
       CASE WHEN d.SupersededAt IS NULL THEN 1 ELSE 0 END AS IsCurrent,
       cl.ReleaseId, cl.Release, ISNULL(cl.Claims, 0) AS Claims
FROM moveit.Deployment d
JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
OUTER APPLY (
    SELECT TOP 1 r.Id AS ReleaseId, r.Name AS Release,
           (SELECT COUNT(*) FROM moveit.ReleaseBuild rb2 JOIN moveit.Release r2 ON r2.Id = rb2.ReleaseId
             WHERE r2.ApplicationId = d.ApplicationId AND rb2.Build = d.Build) AS Claims
    FROM moveit.ReleaseBuild rb JOIN moveit.Release r ON r.Id = rb.ReleaseId
    WHERE r.ApplicationId = d.ApplicationId AND rb.Build = d.Build
    ORDER BY r.Id DESC
) cl
ORDER BY d.DetectedAt DESC, d.Id DESC;
