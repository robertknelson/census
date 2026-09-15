-- Every application the board knows: any with a release or a registered endpoint.
--
-- Name is the one the application reports about itself (health.Deployment.Application, from
-- the payload) — never derived from an endpoint's moniker or identifier. An application that
-- has never reported has no name here until the Application registry is found (move-it.md
-- open item 10); the board shows it by id, which is the honest state.
-- Read-only.

WITH ids AS (
    SELECT ApplicationId FROM moveit.Release
    UNION
    SELECT ApplicationId FROM health.HealthEndpoint
),
reported AS (
    SELECT ApplicationId, Application,
           ROW_NUMBER() OVER (PARTITION BY ApplicationId ORDER BY DetectedAt DESC, Id DESC) AS rn
    FROM health.Deployment
)
SELECT ids.ApplicationId, r.Application AS Name
FROM ids
LEFT JOIN reported r ON r.ApplicationId = ids.ApplicationId AND r.rn = 1
ORDER BY ids.ApplicationId;
