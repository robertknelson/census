-- The calendar (move-it.md §21): every dated thing the estate saw or people said, one row each,
-- for the page to lay on a month grid. The page groups by application, stage and local day;
-- day boundaries are the reader's, so nothing here is bucketed. Read-only.
--
--   arrived           first time a build was seen at a stage (any endpoint there)   - observed
--                     (not when that first sight was the endpoint's first ping)
--   returned          an older build put back at a stage, by 08's rule (a rollback) - observed
--   event             a human event, every kind but 'note'                           - asserted
--   recorded-through  one row: the latest DetectedAt in the ledger. The ledger is filled by a
--                     manual backfill (no SQL Agent), so after this nothing is known.
--
-- Planned dates (Release.TargetDate, PastTarget) come from 02, which the page already reads.

WITH seen AS (
    SELECT ApplicationId, Build, MIN(DetectedAt) AS FirstSeen FROM moveit.Deployment GROUP BY ApplicationId, Build
),
claim AS (   -- the release that claims a build, newest claim first (as history.sql)
    SELECT r.ApplicationId, rb.Build, r.Id AS ReleaseId, r.Name AS Release,
           ROW_NUMBER() OVER (PARTITION BY r.ApplicationId, rb.Build ORDER BY r.Id DESC) AS rn
    FROM moveit.ReleaseBuild rb JOIN moveit.Release r ON r.Id = rb.ReleaseId
),
first AS (   -- each build's first row at each stage
    SELECT d.ApplicationId, ep.Stage, d.Build, d.DetectedAt, d.PreviousId,
           ROW_NUMBER() OVER (PARTITION BY d.ApplicationId, ep.Stage, d.Build ORDER BY d.DetectedAt, d.Id) AS rn
    FROM moveit.Deployment d JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
),
obs AS (
    -- A first row with no PreviousId is the endpoint's first ping: the build was already
    -- there when watching began, so it did not arrive that day and is not drawn.
    SELECT 'arrived' AS Kind, DetectedAt AS At, ApplicationId, Stage, Build, NULL AS ReplacedBuild
    FROM first WHERE rn = 1 AND PreviousId IS NOT NULL
    UNION ALL
    SELECT 'returned', d.DetectedAt, d.ApplicationId, ep.Stage, d.Build, p.Build
    FROM moveit.Deployment d
    JOIN moveit.Deployment p ON p.Id = d.PreviousId
    JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
    JOIN seen sd ON sd.ApplicationId = d.ApplicationId AND sd.Build = d.Build
    JOIN seen sp ON sp.ApplicationId = p.ApplicationId AND sp.Build = p.Build
    WHERE sd.FirstSeen < sp.FirstSeen
)
SELECT o.Kind, o.At, o.ApplicationId, o.Stage, o.Build, o.ReplacedBuild,
       c.ReleaseId, c.Release, NULL AS EventKind, NULL AS [By], NULL AS Note
FROM obs o
LEFT JOIN claim c ON c.ApplicationId = o.ApplicationId AND c.Build = o.Build AND c.rn = 1
UNION ALL
SELECT 'event', e.At, r.ApplicationId, e.Stage, e.Build, NULL,
       r.Id, r.Name, e.Kind, e.[By], e.Note
FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
WHERE e.Kind <> 'note'
UNION ALL
SELECT 'recorded-through', MAX(DetectedAt), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
FROM moveit.Deployment
ORDER BY At;
