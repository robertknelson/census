-- Q: Everything known about a feature or fix, in one JSON document. (App. A, all readers)
--
-- One array element per work item: the item; its application (with every payload `project`
-- it has reported, verbatim); its release (target, approval); where it is now (01's status);
-- every stage it ever reached, with first arrival and latency; the builds that carry it and
-- every ledger row for each; the release's events; its links both ways, each with the
-- other side's status.
--
-- Latency, in days to one decimal, all from evidence:
--   stages[].fromFirstSeen    - first sight of its first build (DEV, normally) -> this stage
--   stages[].fromPrevious     - the previous stage reached -> this stage
--   latency.entryLag          - first sight of its first build -> the item was recorded
--   latency.firstSeenToProd   - end to end
--   latency.approvalToProd    - the client's interval ("theirs", 09)
--   latency.daysThere         - in its current stage
-- stages[] counts arrivals later rolled back; status is where it is now. stages[] and builds[]
-- also count the item's own first build when its release does not claim it (01 does not).
--
-- Filters, all optional, combined with AND:
--   @WorkItemId, @ReleaseId, @ApplicationId
--   @Project  - the application has reported this payload `project` (moveit.Deployment.Project)
--   @Stage    - its status now: a stage, or 'with the devs' | 'not deployed' | 'no evidence' | 'removed'
--
-- The CTEs through `best` are 01's location rule verbatim (dep adds Machine); change both
-- together. Read-only.

DECLARE @WorkItemId    int          = NULL;
DECLARE @ReleaseId     int          = NULL;
DECLARE @ApplicationId int          = NULL;
DECLARE @Project       nvarchar(50) = NULL;
DECLARE @Stage         nvarchar(25) = NULL;

WITH stg AS (
    SELECT x.Identifier AS Stage, x.Sort FROM core.SelectItem x
    JOIN core.SelectItem y ON y.Id = x.MasterId WHERE y.Identifier = 'stages' AND x.IsShow = 1
      AND (EXISTS (SELECT 1 FROM health.HealthEndpoint he WHERE he.Stage = x.Identifier)      -- only stages seen:
           OR EXISTS (SELECT 1 FROM moveit.ReleaseEvent re WHERE re.Stage = x.Identifier))  -- registered or asserted
),
dep AS (
    SELECT d.ApplicationId, d.EndpointId, ep.Stage, d.Build, d.DetectedAt AS At, d.SupersededAt, 'observed' AS Evidence, d.Machine
    FROM moveit.Deployment d JOIN health.HealthEndpoint ep ON ep.Id = d.EndpointId
    UNION ALL
    SELECT r.ApplicationId, NULL, e.Stage, e.Build, e.At,
           LEAD(e.At) OVER (PARTITION BY r.ApplicationId, e.Stage ORDER BY e.At, e.Id), 'asserted', NULL
    FROM moveit.ReleaseEvent e JOIN moveit.Release r ON r.Id = e.ReleaseId
    WHERE e.Kind = 'deployed-asserted' AND e.Build IS NOT NULL AND e.Stage IS NOT NULL
),
seen AS (
    SELECT ApplicationId, Build, MIN(At) AS FirstSeen FROM dep GROUP BY ApplicationId, Build
),
cur AS (
    SELECT dep.*, s.Sort FROM dep JOIN stg s ON s.Stage = dep.Stage WHERE dep.SupersededAt IS NULL
),
holds AS (
    SELECT r.ApplicationId, rb.Build, w.Id AS WorkItemId
    FROM moveit.ReleaseBuild rb
    JOIN moveit.Release r  ON r.Id = rb.ReleaseId
    JOIN moveit.WorkItem w ON w.ReleaseId = r.Id AND w.RemovedAt IS NULL AND w.IncludedInBuild IS NOT NULL
    LEFT JOIN seen sb ON sb.ApplicationId = r.ApplicationId AND sb.Build = rb.Build
    LEFT JOIN seen sw ON sw.ApplicationId = r.ApplicationId AND sw.Build = w.IncludedInBuild
    WHERE w.IncludedInBuild = rb.Build
       OR (sw.FirstSeen IS NOT NULL AND sb.FirstSeen IS NOT NULL AND sw.FirstSeen <= sb.FirstSeen)
),
at_stage AS (
    SELECT c.WorkItemId, cur.Stage, cur.Sort, MIN(d.At) AS Since, MAX(cur.Evidence) AS Evidence
    FROM holds c
    JOIN dep d   ON d.ApplicationId = c.ApplicationId AND d.Build = c.Build
    JOIN cur     ON cur.ApplicationId = d.ApplicationId AND cur.Stage = d.Stage
                AND (cur.EndpointId = d.EndpointId OR (cur.EndpointId IS NULL AND d.EndpointId IS NULL))
    JOIN seen sc ON sc.ApplicationId = cur.ApplicationId AND sc.Build = cur.Build
    JOIN seen sd ON sd.ApplicationId = d.ApplicationId   AND sd.Build = d.Build
    WHERE sc.FirstSeen >= sd.FirstSeen
    GROUP BY c.WorkItemId, cur.Stage, cur.Sort
),
best AS (
    SELECT WorkItemId, Stage, Since, Evidence,
           ROW_NUMBER() OVER (PARTITION BY WorkItemId ORDER BY Sort DESC, Evidence DESC) AS rn
    FROM at_stage
),
item AS (   -- 01's row, plus when its first build was first seen
    SELECT w.Id AS WorkItemId, w.ReleaseId, r.ApplicationId, w.Kind, w.Title, w.Description, w.BuiltBy, w.ExternalRef,
           w.IncludedInBuild, w.FoundInStage, w.RemovedAt, w.RemovedNote, w.CreatedAt, w.CreatedBy,
           CASE
               WHEN w.RemovedAt IS NOT NULL      THEN 'removed'
               WHEN w.IncludedInBuild IS NULL    THEN 'with the devs'
               WHEN b.Stage IS NOT NULL          THEN b.Stage
               WHEN NOT EXISTS (SELECT 1 FROM dep WHERE dep.ApplicationId = r.ApplicationId) THEN 'no evidence'
               ELSE 'not deployed'
           END AS Status,
           b.Evidence, b.Since, sw.FirstSeen
    FROM moveit.WorkItem w
    JOIN moveit.Release r ON r.Id = w.ReleaseId
    LEFT JOIN best b ON b.WorkItemId = w.Id AND b.rn = 1
    LEFT JOIN seen sw ON sw.ApplicationId = r.ApplicationId AND sw.Build = w.IncludedInBuild
),
carriers AS (   -- holds, plus the item's own first build when its release does not claim it
    SELECT ApplicationId, Build, WorkItemId FROM holds
    UNION
    SELECT r.ApplicationId, w.IncludedInBuild, w.Id
    FROM moveit.WorkItem w JOIN moveit.Release r ON r.Id = w.ReleaseId
    WHERE w.RemovedAt IS NULL AND w.IncludedInBuild IS NOT NULL
),
reached AS (   -- first arrival at each stage ever, by a build carrying the item
    SELECT h.WorkItemId, d.Stage, s.Sort, d.At, d.Build, d.Evidence, d.Machine,
           ROW_NUMBER() OVER (PARTITION BY h.WorkItemId, d.Stage ORDER BY d.At, d.Evidence DESC) AS rn
    FROM carriers h
    JOIN dep d ON d.ApplicationId = h.ApplicationId AND d.Build = h.Build
    JOIN stg s ON s.Stage = d.Stage
),
firsts AS (
    SELECT WorkItemId, Stage, Sort, At, Build, Evidence, Machine,
           LAG(At) OVER (PARTITION BY WorkItemId ORDER BY Sort, At) AS PrevAt
    FROM reached WHERE rn = 1
),
prod AS (
    SELECT f.WorkItemId, f.At FROM firsts f WHERE f.Sort = (SELECT MAX(Sort) FROM stg)
),
approval AS (   -- the latest approval of the release
    SELECT ReleaseId, At, Build, [By],
           ROW_NUMBER() OVER (PARTITION BY ReleaseId ORDER BY At DESC, Id DESC) AS rn
    FROM moveit.ReleaseEvent WHERE Kind = 'approved'
),
reported AS (
    SELECT ApplicationId, Application,
           ROW_NUMBER() OVER (PARTITION BY ApplicationId ORDER BY DetectedAt DESC, Id DESC) AS rn
    FROM moveit.Deployment
)
SELECT i.WorkItemId            AS [id],
       i.Kind                  AS [kind],
       i.Title                 AS [title],
       i.Description           AS [description],
       i.BuiltBy               AS [builtBy],
       i.ExternalRef           AS [externalRef],
       i.IncludedInBuild       AS [includedInBuild],
       i.FoundInStage          AS [foundInStage],
       i.CreatedAt             AS [recorded.at],
       i.CreatedBy             AS [recorded.by],
       i.RemovedAt             AS [removed.at],
       i.RemovedNote           AS [removed.note],

       i.ApplicationId         AS [application.id],
       rp.Application          AS [application.name],
       JSON_QUERY(ISNULL((SELECT DISTINCT d.Project AS [project] FROM moveit.Deployment d
                          WHERE d.ApplicationId = i.ApplicationId AND d.Project IS NOT NULL
                          FOR JSON PATH), '[]')) AS [application.projects],

       r.Id                    AS [release.id],
       r.Name                  AS [release.name],
       r.Kind                  AS [release.kind],
       r.TargetDate            AS [release.targetDate],
       CASE WHEN r.TargetDate < CAST(sysdatetimeoffset() AS date) AND p.At IS NULL THEN 1 ELSE 0 END AS [release.pastTarget],
       r.Note                  AS [release.note],
       ap.At                   AS [release.approval.at],
       ap.Build                AS [release.approval.build],
       ap.[By]                 AS [release.approval.by],

       i.Status                AS [now.status],
       i.Evidence              AS [now.evidence],
       i.Since                 AS [now.since],

       i.FirstSeen             AS [latency.firstSeen],
       CAST(DATEDIFF(minute, i.FirstSeen, i.CreatedAt) / 1440.0 AS decimal(9,1)) AS [latency.entryLag],
       p.At                    AS [latency.firstProd],
       CAST(DATEDIFF(minute, i.FirstSeen, p.At) / 1440.0 AS decimal(9,1))       AS [latency.firstSeenToProd],
       CAST(DATEDIFF(minute, ap.At, p.At) / 1440.0 AS decimal(9,1))             AS [latency.approvalToProd],
       CAST(DATEDIFF(minute, i.Since, sysdatetimeoffset()) / 1440.0 AS decimal(9,1)) AS [latency.daysThere],

       JSON_QUERY(ISNULL((
           SELECT f.Stage AS [stage], f.At AS [firstArrived], f.Build AS [build], f.Machine AS [machine], f.Evidence AS [evidence],
                  CAST(DATEDIFF(minute, i.FirstSeen, f.At) / 1440.0 AS decimal(9,1)) AS [fromFirstSeen],
                  CAST(DATEDIFF(minute, f.PrevAt, f.At) / 1440.0 AS decimal(9,1))   AS [fromPrevious]
           FROM firsts f WHERE f.WorkItemId = i.WorkItemId
           ORDER BY f.Sort, f.At
           FOR JSON PATH, INCLUDE_NULL_VALUES), '[]')) AS [stages],

       JSON_QUERY(ISNULL((
           SELECT h.Build AS [build], rb.Note AS [note], s.FirstSeen AS [firstSeen],
                  JSON_QUERY(ISNULL((
                      SELECT d.Stage AS [stage], d.Machine AS [machine], d.At AS [at], d.SupersededAt AS [supersededAt],
                             d.Evidence AS [evidence], CASE WHEN d.SupersededAt IS NULL THEN 1 ELSE 0 END AS [current]
                      FROM dep d WHERE d.ApplicationId = h.ApplicationId AND d.Build = h.Build
                      ORDER BY d.At
                      FOR JSON PATH, INCLUDE_NULL_VALUES), '[]')) AS [deployments]
           FROM carriers h
           LEFT JOIN moveit.ReleaseBuild rb ON rb.ReleaseId = i.ReleaseId AND rb.Build = h.Build
           LEFT JOIN seen s ON s.ApplicationId = h.ApplicationId AND s.Build = h.Build
           WHERE h.WorkItemId = i.WorkItemId
           ORDER BY s.FirstSeen
           FOR JSON PATH, INCLUDE_NULL_VALUES), '[]')) AS [builds],

       JSON_QUERY(ISNULL((
           SELECT e.Kind AS [kind], e.Stage AS [stage], e.Build AS [build], e.At AS [at], e.[By] AS [by], e.Note AS [note]
           FROM moveit.ReleaseEvent e WHERE e.ReleaseId = i.ReleaseId
           ORDER BY e.At, e.Id
           FOR JSON PATH, INCLUDE_NULL_VALUES), '[]')) AS [events],

       JSON_QUERY(ISNULL((
           SELECT l.Kind AS [kind], o.WorkItemId AS [id], o.Title AS [title], o.ApplicationId AS [applicationId],
                  orl.Name AS [release], o.Status AS [status], l.Note AS [note]
           FROM moveit.WorkItemLink l
           JOIN item o ON o.WorkItemId = l.LinkedWorkItemId
           JOIN moveit.Release orl ON orl.Id = o.ReleaseId
           WHERE l.WorkItemId = i.WorkItemId
           FOR JSON PATH, INCLUDE_NULL_VALUES), '[]')) AS [links.needs],
       JSON_QUERY(ISNULL((
           SELECT l.Kind AS [kind], o.WorkItemId AS [id], o.Title AS [title], o.ApplicationId AS [applicationId],
                  orl.Name AS [release], o.Status AS [status], l.Note AS [note]
           FROM moveit.WorkItemLink l
           JOIN item o ON o.WorkItemId = l.WorkItemId
           JOIN moveit.Release orl ON orl.Id = o.ReleaseId
           WHERE l.LinkedWorkItemId = i.WorkItemId
           FOR JSON PATH, INCLUDE_NULL_VALUES), '[]')) AS [links.neededBy]
FROM item i
JOIN moveit.Release r ON r.Id = i.ReleaseId
LEFT JOIN reported rp ON rp.ApplicationId = i.ApplicationId AND rp.rn = 1
LEFT JOIN prod p ON p.WorkItemId = i.WorkItemId
LEFT JOIN approval ap ON ap.ReleaseId = i.ReleaseId AND ap.rn = 1
WHERE (@WorkItemId    IS NULL OR i.WorkItemId = @WorkItemId)
  AND (@ReleaseId     IS NULL OR i.ReleaseId = @ReleaseId)
  AND (@ApplicationId IS NULL OR i.ApplicationId = @ApplicationId)
  AND (@Stage         IS NULL OR i.Status = @Stage)
  AND (@Project       IS NULL OR EXISTS (SELECT 1 FROM moveit.Deployment d WHERE d.ApplicationId = i.ApplicationId AND d.Project = @Project))
ORDER BY i.ApplicationId, i.ReleaseId, i.WorkItemId
FOR JSON PATH, INCLUDE_NULL_VALUES;
