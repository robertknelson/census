-- THE RULE for health.Deployment, in SQL (move-it.md 10.1). Two producers - the live
-- HealthReport processor and this backfill - must agree, so the live code should implement
-- exactly this and nothing more:
--
--   1. Consider only successful pings that carried a deployment block
--      (IsSuccess = 1, HasContent = 1, Build IS NOT NULL). Absence is not change.
--   2. Order per endpoint by StartAt (then Id to break ties).
--   3. Compare the whole tuple with the previous qualifying ping for the same endpoint:
--      Build, BuildId, SourceVersion, Deploymentat, Machine, Branch. Any difference, or no
--      previous ping, is a deployment row. DetectedAt is the detecting ping's StartAt.
--   4. Then PreviousId / SupersededAt are recomputed for the endpoint from the rows
--      themselves (LAG / LEAD by DetectedAt), so they are always consistent.
--
-- Known blind spot, by design: a redeploy of the same build with no intervening build and an
-- unchanged Deploymentat is invisible to any observer of the payload. Everything else -
-- rollback to an earlier build, a move to another machine, a fresh Deploymentat on the same
-- build - produces a row.
--
-- Project is NULL from backfill: HealthReport has no such column today. The live processor
-- reads it from the payload.
--
-- Idempotent: rows are keyed on HealthReportId (unique index), so re-running inserts nothing
-- already present and only refreshes the back-pointers.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

;WITH q AS (
    SELECT r.Id, r.ApplicationId, r.EndpointId, r.Application, r.Stage, r.Machine, r.Version,
           r.Build, r.BuildId, r.SourceVersion, r.Branch, r.Deploymentat, r.StartAt,
           LAG(r.Build)         OVER (PARTITION BY r.EndpointId ORDER BY r.StartAt, r.Id) AS pBuild,
           LAG(r.BuildId)       OVER (PARTITION BY r.EndpointId ORDER BY r.StartAt, r.Id) AS pBuildId,
           LAG(r.SourceVersion) OVER (PARTITION BY r.EndpointId ORDER BY r.StartAt, r.Id) AS pSourceVersion,
           LAG(r.Deploymentat)  OVER (PARTITION BY r.EndpointId ORDER BY r.StartAt, r.Id) AS pDeploymentat,
           LAG(r.Machine)       OVER (PARTITION BY r.EndpointId ORDER BY r.StartAt, r.Id) AS pMachine,
           LAG(r.Branch)        OVER (PARTITION BY r.EndpointId ORDER BY r.StartAt, r.Id) AS pBranch
    FROM health.HealthReport r
    WHERE r.IsSuccess = 1 AND r.HasContent = 1 AND r.Build IS NOT NULL
)
INSERT INTO health.Deployment
    (ApplicationId, EndpointId, Application, ReportedStage, Machine, Project, Version,
     Build, BuildId, SourceVersion, Branch, Deploymentat, DetectedAt, HealthReportId)
SELECT q.ApplicationId, q.EndpointId, q.Application, q.Stage, q.Machine, NULL, q.Version,
       q.Build, q.BuildId, q.SourceVersion, NULLIF(q.Branch, ''), q.Deploymentat, q.StartAt, q.Id
FROM q
WHERE (   q.pBuild IS NULL
       OR q.Build <> q.pBuild
       OR ISNULL(q.BuildId, '')       <> ISNULL(q.pBuildId, '')
       OR ISNULL(q.SourceVersion, '') <> ISNULL(q.pSourceVersion, '')
       OR q.Deploymentat              <> q.pDeploymentat
       OR q.Machine                   <> q.pMachine
       OR ISNULL(q.Branch, '')        <> ISNULL(q.pBranch, ''))
  AND NOT EXISTS (SELECT 1 FROM health.Deployment d WHERE d.HealthReportId = q.Id);

DECLARE @inserted int = @@ROWCOUNT;

;WITH o AS (
    SELECT d.Id,
           LAG(d.Id)          OVER (PARTITION BY d.EndpointId ORDER BY d.DetectedAt, d.Id) AS PrevId,
           LEAD(d.DetectedAt) OVER (PARTITION BY d.EndpointId ORDER BY d.DetectedAt, d.Id) AS NextAt
    FROM health.Deployment d
)
UPDATE d
   SET PreviousId   = o.PrevId,
       SupersededAt = o.NextAt
FROM health.Deployment d
JOIN o ON o.Id = d.Id
WHERE ISNULL(d.PreviousId, -1) <> ISNULL(o.PrevId, -1)
   OR ISNULL(d.SupersededAt, '0001-01-01') <> ISNULL(o.NextAt, '0001-01-01');

PRINT CONCAT('health.Deployment: ', @inserted, ' inserted, ', @@ROWCOUNT, ' back-pointers refreshed');
