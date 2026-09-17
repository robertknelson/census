-- Q: Does the app think it is in the stage we registered it for? (move-it.md 9, the four voices)
--
-- Registration (HealthEndpoint.Stage) vs the payload's claim (Deployment.ReportedStage), for
-- what is deployed now. A mismatch is a release variable on the wrong slot or a friendly URL
-- moved to another box. Census's asserted stage is the third voice and joins here once the
-- projection exists (move-it.md 8 addendum).
--
-- Read-only.

SELECT d.ApplicationId, d.Application, d.EndpointId, ep.Identifier, ep.Url,
       ep.Stage AS RegisteredStage, d.ReportedStage, d.Machine, d.Build, d.DetectedAt AS Since
FROM moveit.Deployment d
JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
WHERE d.SupersededAt IS NULL
  AND ep.Stage <> d.ReportedStage COLLATE DATABASE_DEFAULT
ORDER BY d.ApplicationId, ep.Stage;
