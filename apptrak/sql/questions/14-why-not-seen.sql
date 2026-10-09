-- Q: Why does this item read "Built, not seen" (or sit at a lower stage than expected)?
--    (move-it.md §29, his 11: a build that WAS deployed to DEV, superseded a month later, and
--    the item still reads not seen. "not sure how to assist, since you cannot see the data.")
--
-- Set @WorkItemId (or @Title) and run against the real AppTrak. Read-only. An item that does
-- not match says so in one row and lists the items to pick from (2026-10-09: "six resultsets,
-- all empty" — no page showed the Id then; the detail panel does now). Otherwise six result
-- sets, each one of the links the location rule (01) needs; the broken one is the answer:
--   1. the item — its build string, length and bytes (a trailing space or a look-alike
--      character is invisible in a grid; the hex is not)
--   2. the release's claimed builds (ReleaseBuild), with how each compares to the item's build:
--      exact, same after trim, same ignoring case, or different
--   3. every deployment of any of those builds, observed and asserted, with what superseded it
--   4. what is at each stage NOW for the application, and whether the current build was first
--      seen before the item's build (older = the item is not carried forward; rule 5)
--   5. near misses: deployments for the application whose build string contains, or is
--      contained by, the item's build — the typo finder
--   6. the endpoints registered for the application — a changed EndpointId at DEV means the old
--      deployment rows hang off an endpoint nothing current matches

DECLARE @WorkItemId int = 0;              -- <- the item's Id (the detail panel shows it as #Id) ...
DECLARE @Title nvarchar(200) = NULL;      -- ... or part of its title instead, e.g. N'%ledger%'

SET NOCOUNT ON;

-- A title resolves to the one item it matches; several matches or none are said, not guessed.
IF @Title IS NOT NULL AND (SELECT COUNT(*) FROM moveit.WorkItem WHERE Title LIKE @Title) = 1
    SELECT @WorkItemId = Id FROM moveit.WorkItem WHERE Title LIKE @Title;

DECLARE @ApplicationId int, @ReleaseId int, @Build nvarchar(50);
SELECT @ApplicationId = w.ApplicationId, @ReleaseId = w.ReleaseId, @Build = w.IncludedInBuild
FROM moveit.WorkItem w WHERE w.Id = @WorkItemId;

-- 0. no such item: say so, and offer the nearest — six empty grids answer nothing
IF @ApplicationId IS NULL
BEGIN
    SELECT CASE WHEN @Title IS NOT NULL THEN 'no single work item has a title like ' + @Title + ': '
                ELSE 'no work item has Id ' + CAST(@WorkItemId AS varchar(10)) + ': ' END
           + CAST((SELECT COUNT(*) FROM moveit.WorkItem) AS varchar(10)) + ' items exist, Ids '
           + ISNULL(CAST((SELECT MIN(Id) FROM moveit.WorkItem) AS varchar(10)), '-') + ' to '
           + ISNULL(CAST((SELECT MAX(Id) FROM moveit.WorkItem) AS varchar(10)), '-')
           + '. Set @WorkItemId to one of the Ids below (the detail panel shows it as #Id), or @Title to a pattern matching one title.' AS Problem;
    SELECT TOP 50 w.Id AS WorkItemId, w.Title, w.Kind, w.ApplicationId, r.Name AS [Release], w.IncludedInBuild, w.CreatedAt
    FROM moveit.WorkItem w LEFT JOIN moveit.Release r ON r.Id = w.ReleaseId
    WHERE @Title IS NULL OR w.Title LIKE @Title
    ORDER BY w.CreatedAt DESC, w.Id DESC;
    RETURN;
END;

-- 1. the item
SELECT w.Id AS WorkItemId, w.Title, w.Kind, w.ApplicationId, w.ReleaseId, r.Name AS [Release],
       w.IncludedInBuild, LEN(w.IncludedInBuild) AS BuildLen, DATALENGTH(w.IncludedInBuild) AS BuildBytes,
       CONVERT(varchar(max), CAST(w.IncludedInBuild AS varbinary(max)), 2) AS BuildHex,
       w.RemovedAt, w.CreatedAt
FROM moveit.WorkItem w
LEFT JOIN moveit.Release r ON r.Id = w.ReleaseId
WHERE w.Id = @WorkItemId;

-- 2. the release's claimed builds, compared to the item's
SELECT rb.ReleaseId, rb.Build, LEN(rb.Build) AS BuildLen,
       CONVERT(varchar(max), CAST(rb.Build AS varbinary(max)), 2) AS BuildHex, rb.Note, rb.CreatedAt, rb.CreatedBy,
       CASE WHEN rb.Build = @Build COLLATE Latin1_General_CS_AS THEN 'exact'
            WHEN LTRIM(RTRIM(rb.Build)) = LTRIM(RTRIM(@Build)) COLLATE Latin1_General_CS_AS THEN 'same after trim'
            WHEN rb.Build = @Build THEN 'same ignoring case'
            ELSE 'different' END AS VsItemBuild
FROM moveit.ReleaseBuild rb
WHERE rb.ReleaseId = @ReleaseId
ORDER BY rb.Id;

-- 3. every deployment of the item's build and the claimed builds
;WITH builds AS (
    SELECT @Build AS Build WHERE @Build IS NOT NULL
    UNION SELECT rb.Build FROM moveit.ReleaseBuild rb WHERE rb.ReleaseId = @ReleaseId
),
obs AS (
    SELECT d.EndpointId, ep.Stage, d.Machine, d.Build, d.DetectedAt, d.SupersededAt,
           LEAD(d.Build) OVER (PARTITION BY d.EndpointId ORDER BY d.DetectedAt, d.Id) AS SupersededBy
    FROM moveit.Deployment d JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
    WHERE d.ApplicationId = @ApplicationId
)
SELECT 'observed' AS Evidence, o.EndpointId, o.Stage, o.Machine, o.Build, o.DetectedAt, o.SupersededAt, o.SupersededBy
FROM obs o JOIN builds b ON b.Build = o.Build
UNION ALL
SELECT 'asserted', NULL, e.Stage, NULL, e.Build, e.At, NULL, NULL
FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
JOIN builds b ON b.Build = e.Build
WHERE r.ApplicationId = @ApplicationId AND e.Kind = 'deployed-asserted' AND e.Stage IS NOT NULL
ORDER BY Stage, DetectedAt;

-- 4. what is at each stage now, and whether it is older than the item's build (rule 5)
;WITH dep AS (
    SELECT d.ApplicationId, d.EndpointId, ep.Stage, d.Build, d.DetectedAt AS At, d.SupersededAt
    FROM moveit.Deployment d JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
    WHERE d.ApplicationId = @ApplicationId
    UNION ALL
    SELECT r.ApplicationId, NULL, e.Stage, e.Build, e.At,
           LEAD(e.At) OVER (PARTITION BY r.ApplicationId, e.Stage ORDER BY e.At, e.Id)
    FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
    WHERE r.ApplicationId = @ApplicationId AND e.Kind = 'deployed-asserted' AND e.Build IS NOT NULL AND e.Stage IS NOT NULL
),
seen AS (SELECT Build, MIN(At) AS FirstSeen FROM dep GROUP BY Build)
SELECT cur.Stage, cur.EndpointId, cur.Build AS CurrentBuild, sc.FirstSeen AS CurrentFirstSeen,
       si.FirstSeen AS ItemBuildFirstSeen,
       CASE WHEN rb.Build IS NOT NULL THEN 'yes' ELSE 'no' END AS CurrentClaimedByRelease,
       CASE WHEN si.FirstSeen IS NULL THEN 'item build never seen for this app'
            WHEN cur.Build = @Build THEN 'the item build itself: the item IS here'
            WHEN sc.FirstSeen < si.FirstSeen THEN 'current is OLDER: the item is not carried forward here (a rollback)'
            WHEN rb.Build IS NOT NULL THEN 'current is newer and claimed by the release: the item IS here'
            ELSE 'current is newer but NOT claimed by the release: claim it on the release page and the item reads here' END AS Reading
FROM dep cur
JOIN seen sc ON sc.Build = cur.Build
LEFT JOIN seen si ON si.Build = @Build
LEFT JOIN moveit.ReleaseBuild rb ON rb.ReleaseId = @ReleaseId AND rb.Build = cur.Build
WHERE cur.SupersededAt IS NULL
ORDER BY cur.Stage, cur.EndpointId;

-- 5. near misses: the typo finder
SELECT d.Build, COUNT(*) AS Deployments, MIN(d.DetectedAt) AS FirstSeen, MAX(d.DetectedAt) AS LastSeen,
       LEN(d.Build) AS BuildLen, CONVERT(varchar(max), CAST(d.Build AS varbinary(max)), 2) AS BuildHex
FROM moveit.Deployment d
WHERE d.ApplicationId = @ApplicationId AND @Build IS NOT NULL AND d.Build <> @Build COLLATE Latin1_General_CS_AS
  AND (d.Build LIKE '%' + LTRIM(RTRIM(@Build)) + '%' OR LTRIM(RTRIM(@Build)) LIKE '%' + d.Build + '%'
       OR LTRIM(RTRIM(d.Build)) = LTRIM(RTRIM(@Build)))
GROUP BY d.Build
ORDER BY LastSeen DESC;

-- 6. the application's endpoints
SELECT ep.Id AS EndpointId, ep.Identifier, ep.Stage,
       (SELECT COUNT(*) FROM moveit.Deployment d WHERE d.EndpointId = ep.Id) AS Deployments,
       (SELECT MAX(d.DetectedAt) FROM moveit.Deployment d WHERE d.EndpointId = ep.Id) AS LastDeployment
FROM health.HealthEndpoint ep
WHERE ep.Id IN (SELECT DISTINCT d.EndpointId FROM moveit.Deployment d WHERE d.ApplicationId = @ApplicationId)
ORDER BY ep.Stage, ep.Id;
