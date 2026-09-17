-- Every build a release claims, with where the ledger says that build is right now: one row
-- per (release, build, endpoint currently carrying it); a claimed build on no box is one row
-- with null endpoint columns. For the release page (move-it.md §16). Read-only.
SELECT rb.ReleaseId, rb.Build, rb.Note,
       d.EndpointId, ep.Stage, d.Machine, d.DetectedAt
FROM moveit.ReleaseBuild rb
JOIN moveit.Release r ON r.Id = rb.ReleaseId
LEFT JOIN moveit.Deployment d ON d.ApplicationId = r.ApplicationId AND d.Build = rb.Build AND d.SupersededAt IS NULL
LEFT JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
ORDER BY rb.ReleaseId, rb.Id, ep.Stage, d.Machine;
