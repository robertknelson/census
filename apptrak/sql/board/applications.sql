-- Every application the board knows: any with a release or a registered endpoint.
--
-- Name is the registry's (membership.Application.Name; move-it.md open item 10, found
-- 2026-10-22), so an application with no health endpoint is named like any other. Where the
-- registry has no row, the name the application reports about itself (moveit.Deployment.
-- Application, from the payload); never derived from an endpoint's moniker or identifier. With
-- neither, the board shows it by id, which is the honest state.
-- Read-only.

WITH ids AS (
    SELECT ApplicationId FROM moveit.Release
    UNION
    SELECT ApplicationId FROM health.HealthEndpoint
),
reported AS (
    SELECT ApplicationId, Application,
           ROW_NUMBER() OVER (PARTITION BY ApplicationId ORDER BY DetectedAt DESC, Id DESC) AS rn
    FROM moveit.Deployment
)
SELECT ids.ApplicationId, COALESCE(a.Name, r.Application) AS Name
FROM ids
LEFT JOIN membership.Application a ON a.Id = ids.ApplicationId
LEFT JOIN reported r ON r.ApplicationId = ids.ApplicationId AND r.rn = 1
ORDER BY ids.ApplicationId;
