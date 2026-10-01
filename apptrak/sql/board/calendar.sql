-- The calendar (move-it.md §21): every dated thing the estate saw or people said, one row each,
-- for the page to lay on a month grid. The page groups by application, stage and local day;
-- day boundaries are the reader's, so nothing here is bucketed. Read-only.
--
--   arrived           first time a build was seen at a stage (any endpoint there)   - observed
--                     (not when that first sight was the endpoint's first ping)
--   returned          an older build put back at a stage, by 08's rule (a rollback) - observed
--   event             a human event, every kind but 'note'                           - asserted
--   recorded-through  one row: how far the ledger has looked. The latest backfill run's
--                     ThroughAt when moveit.BackfillRun has rows (Source 'backfill', with RanAt
--                     and By); otherwise the latest DetectedAt (Source 'last change'), which
--                     cannot tell a quiet week from an un-run backfill.
--
-- Planned dates (Release.TargetDate, PastTarget) come from 02, which the page already reads.

DECLARE @through datetimeoffset, @ranAt datetimeoffset, @ranBy nvarchar(128);
IF OBJECT_ID('moveit.BackfillRun', 'U') IS NOT NULL
    SELECT TOP 1 @through = ThroughAt, @ranAt = RanAt, @ranBy = RanBy
    FROM moveit.BackfillRun WHERE ThroughAt IS NOT NULL ORDER BY Id DESC;

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
       c.ReleaseId, c.Release, NULL AS EventKind, NULL AS [By], NULL AS Note, NULL AS Source, NULL AS RanAt
FROM obs o
LEFT JOIN claim c ON c.ApplicationId = o.ApplicationId AND c.Build = o.Build AND c.rn = 1
UNION ALL
SELECT 'event', e.At, r.ApplicationId, e.Stage, e.Build, NULL,
       r.Id, r.Name, e.Kind, e.[By], e.Note, NULL, NULL
FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
WHERE e.Kind <> 'note'
UNION ALL
SELECT 'recorded-through', ISNULL(@through, MAX(DetectedAt)), NULL, NULL, NULL, NULL, NULL, NULL, NULL, @ranBy, NULL,
       CASE WHEN @through IS NULL THEN 'last change' ELSE 'backfill' END, @ranAt
FROM moveit.Deployment
ORDER BY At;
