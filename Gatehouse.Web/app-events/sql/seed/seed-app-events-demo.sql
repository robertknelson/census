-- Demo AppEvents (gatehouse.md §12.5), manufactured: never real data, never a real server. Run on the local logs
-- database (CensusLogsDemo) after ddl/001-app-event.sql. Idempotent: the demo rows (Data's "demo": true) are
-- replaced on every run, so they always cover the last seven days.
--
-- Units of work of the kind underwriting / quote-request cross three systems:
--   WidgetPortal  created, handed-off
--   LedgerService received (a queue wait of minutes), started, handed-off to the mainframe
--   PolicyMaster  received (the next batch window, hours later; the mainframe's file drop arrives late), started,
--                 completed or failed
--   LedgerService completed or failed; WidgetPortal completed or failed
-- Some work is stuck (handed off to the mainframe, never received), some still running. billing / invoice-send is a
-- kind nobody registered (the catalog screen offers to register it).

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DELETE FROM apptrak.AppEvent WHERE ISJSON(Data) = 1 AND JSON_VALUE(Data, '$.demo') = 'true';

DECLARE @now datetimeoffset = SYSDATETIMEOFFSET();
DECLARE @people TABLE (n int, Identifier nvarchar(50));
INSERT @people VALUES (0, N'cdiaz'), (1, N'mlopez'), (2, N'tbrown'), (3, N'akim'), (4, N'jsmith');

DECLARE @steps TABLE (
    Work int, Step int, Application nvarchar(50), Stage nvarchar(15), Machine nvarchar(25), Identifier nvarchar(50),
    Activity nvarchar(50), At datetimeoffset, LagSeconds int, Parent int, PolicyKey nvarchar(20), Insured nvarchar(60));

-- 60 units of work, one about every 2.8 hours over the last week. A checksum of the unit's number stands in for chance,
-- so every run makes the same week.
WITH n AS (SELECT TOP (60) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS w FROM sys.all_objects),
u AS (
    SELECT w,
           DATEADD(minute, -(10080 - w * 166), @now) AS t0,
           ABS(CHECKSUM(w * 7919)) % 100 AS r,
           2 + ABS(CHECKSUM(w * 104729)) % 28 AS queueMinutes,
           60 + ABS(CHECKSUM(w * 1299709)) % 240 AS batchMinutes,
           5 + ABS(CHECKSUM(w * 15485863)) % 40 AS mainframeMinutes,
           (SELECT Identifier FROM @people WHERE n = w % 5) AS person
    FROM n
)
INSERT @steps
SELECT u.w, s.Step, s.Application, N'PROD', s.Machine, CASE WHEN s.Application = N'WidgetPortal' THEN u.person WHEN s.Application = N'LedgerService' THEN N'svc-ledger' ELSE N'BATCH01' END,
       s.Activity, s.At, s.Lag, s.Parent, CONCAT(N'POL-', 40000 + u.w), CONCAT(N'Insured ', CHAR(65 + u.w % 26), N' Holdings')
FROM u
CROSS APPLY (VALUES
    (1, N'WidgetPortal',  N'WEB01', N'created',    u.t0,                                                                   2,   NULL),
    (2, N'WidgetPortal',  N'WEB01', N'handed-off', DATEADD(second, 4, u.t0),                                               2,   1),
    (3, N'LedgerService', N'APP02', N'received',   DATEADD(minute, u.queueMinutes, u.t0),                                  3,   2),
    (4, N'LedgerService', N'APP02', N'started',    DATEADD(minute, u.queueMinutes + 1, u.t0),                              3,   3),
    (5, N'LedgerService', N'APP02', N'handed-off', DATEADD(minute, u.queueMinutes + 4, u.t0),                              3,   4),
    (6, N'PolicyMaster',  N'MVS1',  N'received',   DATEADD(minute, u.queueMinutes + 4 + u.batchMinutes, u.t0),             5400, 5),
    (7, N'PolicyMaster',  N'MVS1',  N'started',    DATEADD(minute, u.queueMinutes + 5 + u.batchMinutes, u.t0),             5400, 6),
    (8, N'PolicyMaster',  N'MVS1',  CASE WHEN u.r < 12 THEN N'failed' ELSE N'completed' END,
                                                   DATEADD(minute, u.queueMinutes + 5 + u.batchMinutes + u.mainframeMinutes, u.t0), 5400, 7),
    (9, N'LedgerService', N'APP02', CASE WHEN u.r < 12 THEN N'failed' ELSE N'completed' END,
                                                   DATEADD(minute, u.queueMinutes + 6 + u.batchMinutes + u.mainframeMinutes, u.t0), 3,  8),
    (10, N'WidgetPortal', N'WEB01', CASE WHEN u.r < 12 THEN N'failed' ELSE N'completed' END,
                                                   DATEADD(minute, u.queueMinutes + 7 + u.batchMinutes + u.mainframeMinutes, u.t0), 2,  9)
) s (Step, Application, Machine, Activity, At, Lag, Parent)
-- Stuck: every 15th unit was handed to the mainframe and never received. Still running: whatever has not happened yet.
WHERE NOT (u.w % 15 = 7 AND s.Step >= 6) AND s.At <= @now;

-- One WorkUid per unit, kept in a table first: NEWID() in a joined derived table is evaluated again for every row.
DECLARE @works TABLE (Work int PRIMARY KEY, WorkUid nvarchar(36));
INSERT @works SELECT DISTINCT Work, NULL FROM @steps;
UPDATE @works SET WorkUid = CONVERT(nvarchar(36), NEWID());

DECLARE @uids TABLE (Work int, Step int, Uid nvarchar(36), WorkUid nvarchar(36));
INSERT @uids
SELECT s.Work, s.Step, CONVERT(nvarchar(36), NEWID()), w.WorkUid
FROM @steps s
JOIN @works w ON w.Work = s.Work;

INSERT apptrak.AppEvent (Uid, Identifier, Path, SessionId, CorrelationId, Machine, Stage, Application, StartAt, Namespace,
                         CommandName, CommandActivity, Body, Data, CreatedAt, IsFromApi, WorkUid, ParentUid, SubjectType, SubjectKey, Message)
SELECT i.Uid, s.Identifier,
       CASE s.Application WHEN N'WidgetPortal' THEN N'/quotes/new' WHEN N'LedgerService' THEN N'/api/quotes' ELSE N'QUOTEJOB' END,
       CASE WHEN s.Application = N'WidgetPortal' THEN CONCAT(N'demo-session-', s.Work) ELSE N'' END,
       CONVERT(nvarchar(36), NEWID()), s.Machine, s.Stage, s.Application, s.At, N'underwriting', N'quote-request', s.Activity,
       (SELECT s.PolicyKey AS policy, s.Insured AS insured, N'commercial-auto' AS lob FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
       N'{"demo":true}',
       DATEADD(second, s.LagSeconds, s.At), CASE WHEN s.Application = N'WidgetPortal' THEN 0 ELSE 1 END,
       i.WorkUid, p.Uid, N'policy', s.PolicyKey,
       CONCAT(CASE s.Activity
                  WHEN N'created' THEN N'Requested a quote for '
                  WHEN N'handed-off' THEN N'Sent the quote request for '
                  WHEN N'received' THEN N'Received the quote request for '
                  WHEN N'started' THEN N'Started rating '
                  WHEN N'completed' THEN N'Finished the quote for '
                  ELSE N'Could not quote ' END, s.Insured)
FROM @steps s
JOIN @uids i ON i.Work = s.Work AND i.Step = s.Step
LEFT JOIN @uids p ON p.Work = s.Work AND p.Step = s.Parent;

-- A kind nobody registered: LedgerService sends invoices, one event each, no unit of work.
INSERT apptrak.AppEvent (Uid, Identifier, Path, SessionId, CorrelationId, Machine, Stage, Application, StartAt, Namespace,
                         CommandName, CommandActivity, Body, Data, CreatedAt, IsFromApi, SubjectType, SubjectKey, Message)
SELECT CONVERT(nvarchar(36), NEWID()), N'svc-ledger', N'/api/invoices', N'', CONVERT(nvarchar(36), NEWID()), N'APP02', N'PROD',
       N'LedgerService', DATEADD(minute, -(n.i * 377), @now), N'billing', N'invoice-send', N'completed',
       CONCAT(N'{"invoice":"INV-', 9000 + n.i, N'"}'), N'{"demo":true}', DATEADD(minute, -(n.i * 377), @now), 1,
       N'invoice', CONCAT(N'INV-', 9000 + n.i), CONCAT(N'Sent invoice INV-', 9000 + n.i)
FROM (SELECT TOP (24) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i FROM sys.all_objects) n;

COMMIT;

SELECT Namespace, CommandName, CommandActivity, COUNT(*) AS Events, COUNT(DISTINCT WorkUid) AS Units
FROM apptrak.AppEvent WHERE JSON_VALUE(Data, '$.demo') = 'true'
GROUP BY Namespace, CommandName, CommandActivity ORDER BY 1, 2, 3;
