-- AppTrak demo fixtures for Move It. FABRICATED, and it stays fabricated: no real AppTrak
-- data can reach this environment (move-it.md 6, hard constraint). These rows ARE the
-- coverage - every branch the ledger and the moveit queries must handle is here on purpose.
--
-- Deterministic: fixed clock, fixed ids, no newid() in anything a query compares. Re-running
-- produces the same rows. Idempotent: demo rows are marked (HealthEndpoint.Tags = 'demo',
-- HealthReport.SessionId = 'demo-seed', moveit.*.CreatedBy = 'demo-seed') and deleted first.
--
-- Run order: 001, 002, 003, this file, then backfill-deployment.sql to derive
-- moveit.Deployment from the HealthReport history. Invoke-AppTrakDemo.ps1 does all of it.
--
-- Settings (his rule: a doubtful value is a setting):
DECLARE @T0        datetimeoffset = '2026-07-06T00:00:00+00:00';   -- day 0 of the window
DECLARE @Days      int            = 70;                             -- window length
DECLARE @Cadence   int            = 10;                             -- minutes between pings
DECLARE @NoBlockAt datetimeoffset = '0001-01-01T00:00:00+00:00';   -- Deploymentat sentinel when the payload has no deployment block (assumption, see calls-made-for-you.md)

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;   -- HealthReport carries indexes that refuse writes without it; sqlcmd defaults it off

-- ---------------------------------------------------------------------------------------
-- Coverage map (endpoint -> what it exercises)
--
--  App 1 WidgetCore   (Team B, full regime)  DEV 11 | VAL 12 | PROD 13 | PROD 14 (second server)
--     DEV churn during Sprint 42; promotion; fix after VAL testing; approval; PROD.
--     Hotfix interleaved with Sprint 43 (branch hotfix/login-timeout).
--     ROLLBACK variant A: same build redeployed with a FRESH Deploymentat (PROD, day 56).
--     Multi-server: 14 lags 13 by one day on the Sprint 42 deploy (partial deploy).
--  App 2 WidgetPortal (Team B, full regime)  DEV 21 | VAL 22 | PROD 23
--     STAGE MISMATCH: endpoint 22 is registered VAL but the payload says PROD.
--     Cross-app dependency on WidgetCore (moveit.WorkItemLink), one historical and one
--     current order violation.
--  App 3 LedgerService (Team B, registered, NO deployment block ever)  DEV 31 | VAL 32 | PROD 33
--     "Build unknown" - pings succeed, Build is NULL throughout. Must yield zero Deployment rows.
--  App 4 MortgageGateway (Team A, NO health regime at all)  no endpoints
--     Exists only in moveit; movement via deployed-asserted events. Jenkins-style build ids.
--  App 5 Reporting (Team B, full regime)  DEV 51 | VAL 52 | PROD 53
--     MACHINE MOVE: same build, same Deploymentat, PROD machine changes on day 35.
--     FAILED PINGS: 503s for twelve hours on day 40 inside a stable episode - no row.
--     ROLLBACK variant B: rollback to the earlier build with its ORIGINAL Deploymentat (day 52).
-- ---------------------------------------------------------------------------------------

-- ---- clean previous demo rows ----------------------------------------------------------
DELETE FROM moveit.Deployment    WHERE HealthReportId IN (SELECT Id FROM health.HealthReport WHERE SessionId = 'demo-seed');
DELETE FROM health.HealthReport  WHERE SessionId = 'demo-seed';
DELETE FROM health.HealthEndpoint WHERE Tags = 'demo';
IF OBJECT_ID('moveit.WorkItemLink', 'U') IS NOT NULL DELETE FROM moveit.WorkItemLink WHERE CreatedBy = 'demo-seed';
IF OBJECT_ID('moveit.ReleaseEvent', 'U') IS NOT NULL DELETE FROM moveit.ReleaseEvent WHERE CreatedBy = 'demo-seed';
IF OBJECT_ID('moveit.ReleaseBuild', 'U') IS NOT NULL DELETE FROM moveit.ReleaseBuild WHERE CreatedBy = 'demo-seed';
IF OBJECT_ID('moveit.WorkItem', 'U')     IS NOT NULL DELETE FROM moveit.WorkItem     WHERE CreatedBy = 'demo-seed';
IF OBJECT_ID('moveit.Release', 'U')      IS NOT NULL DELETE FROM moveit.Release      WHERE CreatedBy = 'demo-seed';
-- rows the first shape of 003 wrote as list headers (MasterId = -1 with a Grouping); fixture only
DELETE FROM core.SelectItem WHERE MasterId = -1 AND Grouping IN ('Stage','ReleaseKind','WorkItemKind','LinkKind','EventKind');

-- ---- the stage list, as AppTrak has it in the real database (fixture stands in) ----------
-- Header 'stage', members DEV / VAL / UAT / PROD; Sort is the sequence, VAL and UAT peers.
IF NOT EXISTS (SELECT 1 FROM core.SelectItem WHERE MasterId = -1 AND Identifier = 'stage')
    INSERT core.SelectItem (Identifier, Display, Description, Sort, IsShow, MasterId, Grouping)
    VALUES ('stage', 'stage', 'Deployment stages (fixture stand-in for AppTrak''s list)', 0, 1, -1, NULL);
INSERT core.SelectItem (Identifier, Display, Description, Sort, IsShow, MasterId, Grouping)
SELECT v.Identifier, v.Identifier, v.Description, v.Sort, 1, h.Id, NULL
FROM (VALUES ('DEV',  'Development stage; builds land continuously during a sprint', 10),
             ('VAL',  'Validation stage (Team B)',                                   20),
             ('UAT',  'User acceptance stage (Team A)',                              20),
             ('PROD', 'Production',                                                  30)) v (Identifier, Description, Sort)
JOIN core.SelectItem h ON h.MasterId = -1 AND h.Identifier = 'stage'
WHERE NOT EXISTS (SELECT 1 FROM core.SelectItem x WHERE x.MasterId = h.Id AND x.Identifier = v.Identifier);

-- ---- endpoints -------------------------------------------------------------------------
SET IDENTITY_INSERT health.HealthEndpoint ON;
INSERT INTO health.HealthEndpoint (Id, ApplicationId, Identifier, Moniker, Tags, Stage, Disposition, Url, Authentication, Token, StartAt, UpdateAt)
VALUES
 (11, 1, 'widgetcore-dev',     'WidgetCore DEV',     'demo', 'DEV',  'active', 'https://widgetcore-dev.corp.example/api/health',      0, NULL, @T0, @T0),
 (12, 1, 'widgetcore-val',     'WidgetCore VAL',     'demo', 'VAL',  'active', 'https://widgetcore-val.corp.example/api/health',      0, NULL, @T0, @T0),
 (13, 1, 'widgetcore-prod',    'WidgetCore PROD',    'demo', 'PROD', 'active', 'https://widgetcore.corp.example/api/health',          0, NULL, @T0, @T0),
 (14, 1, 'widgetcore-prod-b',  'WidgetCore PROD B',  'demo', 'PROD', 'active', 'https://webprod02.corp.example/widgetcore/api/health', 0, NULL, @T0, @T0),
 (21, 2, 'widgetportal-dev',   'WidgetPortal DEV',   'demo', 'DEV',  'active', 'https://widgetportal-dev.corp.example/api/health',    0, NULL, @T0, @T0),
 (22, 2, 'widgetportal-val',   'WidgetPortal VAL',   'demo', 'VAL',  'active', 'https://widgetportal-val.corp.example/api/health',    0, NULL, @T0, @T0),
 (23, 2, 'widgetportal-prod',  'WidgetPortal PROD',  'demo', 'PROD', 'active', 'https://widgetportal.corp.example/api/health',        0, NULL, @T0, @T0),
 (31, 3, 'ledger-dev',         'LedgerService DEV',  'demo', 'DEV',  'active', 'https://ledger-dev.corp.example/api/health',          0, NULL, @T0, @T0),
 (32, 3, 'ledger-val',         'LedgerService VAL',  'demo', 'VAL',  'active', 'https://ledger-val.corp.example/api/health',          0, NULL, @T0, @T0),
 (33, 3, 'ledger-prod',        'LedgerService PROD', 'demo', 'PROD', 'active', 'https://ledger.corp.example/api/health',              0, NULL, @T0, @T0),
 (51, 5, 'reporting-dev',      'Reporting DEV',      'demo', 'DEV',  'active', 'https://reporting-dev.corp.example/api/health',       0, NULL, @T0, @T0),
 (52, 5, 'reporting-val',      'Reporting VAL',      'demo', 'VAL',  'active', 'https://reporting-val.corp.example/api/health',       0, NULL, @T0, @T0),
 (53, 5, 'reporting-prod',     'Reporting PROD',     'demo', 'PROD', 'active', 'https://reporting.corp.example/api/health',           0, NULL, @T0, @T0);
SET IDENTITY_INSERT health.HealthEndpoint OFF;

-- ---- episodes ---------------------------------------------------------------------------
-- One row per stretch of time an endpoint answered with one deployment tuple (or none).
-- Days are offsets from @T0; [FromDay, ToDay). DeployDay is the pipeline's Deploymentat claim.
DECLARE @ep TABLE (
    EndpointId int, ApplicationId int, Application nvarchar(50), ReportedStage nvarchar(25),
    FromDay decimal(6,2), ToDay decimal(6,2), Machine nvarchar(25), Version nvarchar(15),
    Build nvarchar(50), BuildId nvarchar(50), Branch nvarchar(50), DeployDay decimal(6,2),
    HttpStatus smallint
);
INSERT INTO @ep VALUES
-- WidgetCore DEV (11): Sprint 42 churn, promotion at day 14, fix builds, Sprint 43 churn
 (11,1,'WidgetCore','DEV',  0, 3,'WEBDEV01','2.3.0','20260706.1','48101','main', 0,200),
 (11,1,'WidgetCore','DEV',  3, 7,'WEBDEV01','2.3.0','20260709.2','48133','main', 3,200),
 (11,1,'WidgetCore','DEV',  7,10,'WEBDEV01','2.3.0','20260712.1','48160','main', 7,200),
 (11,1,'WidgetCore','DEV', 10,14,'WEBDEV01','2.3.0','20260715.3','48197','main',10,200),
 (11,1,'WidgetCore','DEV', 14,18,'WEBDEV01','2.3.0','20260719.1','48231','main',14,200),
 (11,1,'WidgetCore','DEV', 18,30,'WEBDEV01','2.3.0','20260723.2','48270','main',18,200),
 (11,1,'WidgetCore','DEV', 30,45,'WEBDEV01','2.4.0','20260805.1','48402','main',30,200),
 (11,1,'WidgetCore','DEV', 45,70,'WEBDEV01','2.4.0','20260820.4','48566','main',45,200),
-- WidgetCore VAL (12): previous sprint's build, two promotions, then the hotfix
 (12,1,'WidgetCore','VAL',  0,14,'WEBVAL01','2.2.1','20260620.5','47810','main',-16,200),
 (12,1,'WidgetCore','VAL', 14,24,'WEBVAL01','2.3.0','20260715.3','48197','main',14,200),
 (12,1,'WidgetCore','VAL', 24,40,'WEBVAL01','2.3.0','20260723.2','48270','main',24,200),
 (12,1,'WidgetCore','VAL', 40,70,'WEBVAL01','2.3.1','20260815.1','48511','hotfix/login-timeout',40,200),
-- WidgetCore PROD (13): Sprint 42 lands day 30; hotfix day 41; Sprint 43 day 55 fails;
--   ROLLBACK variant A day 56: hotfix build again with a FRESH Deploymentat (56, not 41)
 (13,1,'WidgetCore','PROD', 0,30,'WEBPROD01','2.2.1','20260620.5','47810','main',-14,200),
 (13,1,'WidgetCore','PROD',30,41,'WEBPROD01','2.3.0','20260723.2','48270','main',30,200),
 (13,1,'WidgetCore','PROD',41,55,'WEBPROD01','2.3.1','20260815.1','48511','hotfix/login-timeout',41,200),
 (13,1,'WidgetCore','PROD',55,56,'WEBPROD01','2.4.0','20260820.4','48566','main',55,200),
 (13,1,'WidgetCore','PROD',56,70,'WEBPROD01','2.3.1','20260815.1','48511','hotfix/login-timeout',56,200),
-- WidgetCore PROD second server (14): same story, Sprint 42 arrives a day late (partial deploy)
 (14,1,'WidgetCore','PROD', 0,31,'WEBPROD02','2.2.1','20260620.5','47810','main',-14,200),
 (14,1,'WidgetCore','PROD',31,41,'WEBPROD02','2.3.0','20260723.2','48270','main',31,200),
 (14,1,'WidgetCore','PROD',41,55,'WEBPROD02','2.3.1','20260815.1','48511','hotfix/login-timeout',41,200),
 (14,1,'WidgetCore','PROD',55,56,'WEBPROD02','2.4.0','20260820.4','48566','main',55,200),
 (14,1,'WidgetCore','PROD',56,70,'WEBPROD02','2.3.1','20260815.1','48511','hotfix/login-timeout',56,200),
-- WidgetPortal DEV (21)
 (21,2,'WidgetPortal','DEV',  0,12,'WEBDEV01','5.1.0','20260706.2','48104','main', 0,200),
 (21,2,'WidgetPortal','DEV', 12,26,'WEBDEV01','5.1.0','20260718.1','48222','main',12,200),
 (21,2,'WidgetPortal','DEV', 26,70,'WEBDEV01','5.2.0','20260801.1','48371','main',26,200),
-- WidgetPortal VAL (22): STAGE MISMATCH - registered VAL, payload claims PROD
 (22,2,'WidgetPortal','PROD', 0,26,'WEBVAL01','5.0.3','20260615.3','47755','main',-21,200),
 (22,2,'WidgetPortal','PROD',26,50,'WEBVAL01','5.1.0','20260718.1','48222','main',26,200),
 (22,2,'WidgetPortal','PROD',50,70,'WEBVAL01','5.2.0','20260801.1','48371','main',50,200),
-- WidgetPortal PROD (23): Sprint 42 lands day 29, a day BEFORE its WidgetCore dependency (day 30);
--   Sprint 43 lands day 58 while its WidgetCore dependency was rolled back (day 56) - current violation
 (23,2,'WidgetPortal','PROD', 0,29,'WEBPROD01','5.0.3','20260615.3','47755','main',-21,200),
 (23,2,'WidgetPortal','PROD',29,58,'WEBPROD01','5.1.0','20260718.1','48222','main',29,200),
 (23,2,'WidgetPortal','PROD',58,70,'WEBPROD01','5.2.0','20260801.1','48371','main',58,200),
-- LedgerService (31,32,33): no deployment block, ever. Build NULL => the row is written without a block.
 (31,3,'LedgerService','DEV',  0,70,'WEBDEV01', '1.9.4',NULL,NULL,NULL,NULL,200),
 (32,3,'LedgerService','VAL',  0,70,'WEBVAL01', '1.9.4',NULL,NULL,NULL,NULL,200),
 (33,3,'LedgerService','PROD', 0,70,'WEBPROD01','1.9.2',NULL,NULL,NULL,NULL,200),
-- Reporting DEV (51) / VAL (52)
 (51,5,'Reporting','DEV',  0,20,'WEBDEV01','3.0.0','20260701.1','48040','main',-5,200),
 (51,5,'Reporting','DEV', 20,70,'WEBDEV01','3.1.0','20260720.2','48240','main',20,200),
 (52,5,'Reporting','VAL',  0,22,'WEBVAL01','3.0.0','20260701.1','48040','main',-5,200),
 (52,5,'Reporting','VAL', 22,70,'WEBVAL01','3.1.0','20260720.2','48240','main',22,200),
-- Reporting PROD (53): MACHINE MOVE day 35 (same build, same Deploymentat); FAILED PINGS day 40.0-40.5;
--   new build day 50; ROLLBACK variant B day 52: original build with its ORIGINAL Deploymentat (-3)
 (53,5,'Reporting','PROD', 0,35,'WEBPROD01','3.0.0','20260701.1','48040','main',-3,200),
 (53,5,'Reporting','PROD',35,40,'WEBPROD02','3.0.0','20260701.1','48040','main',-3,200),
 (53,5,'Reporting','PROD',40,40.5,'WEBPROD02','3.0.0',NULL,NULL,NULL,NULL,503),
 (53,5,'Reporting','PROD',40.5,50,'WEBPROD02','3.0.0','20260701.1','48040','main',-3,200),
 (53,5,'Reporting','PROD',50,52,'WEBPROD02','3.1.0','20260720.2','48240','main',50,200),
 (53,5,'Reporting','PROD',52,70,'WEBPROD02','3.0.0','20260701.1','48040','main',-3,200);

-- ---- pings: one HealthReport row per @Cadence minutes inside each episode -----------------
;WITH n AS (
    SELECT TOP (@Days * 24 * 60 / @Cadence) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS i
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
), ticks AS (
    SELECT DATEADD(minute, i * @Cadence, @T0) AS StartAt, CAST(i * @Cadence AS decimal(12,4)) / 1440.0 AS Day
    FROM n
)
INSERT INTO health.HealthReport
    (ApplicationId, EndpointId, SessionId, CorrelationId, Machine, Stage, Application, Version, StartAt,
     Path, Elapsed, HttpStatus, ReasonPhrase, OverallStatus, IsSuccess, HasContent, ContentType,
     Deploymentat, Branch, Build, BuildId, SourceVersion, Report, IsFromApi, IsBatch, CreatedAt)
SELECT e.ApplicationId, e.EndpointId, 'demo-seed',
       CONCAT('demo-', e.EndpointId, '-', FORMAT(t.StartAt, 'yyyyMMddHHmm')),
       e.Machine, e.ReportedStage, e.Application, e.Version, t.StartAt,
       '/api/health',
       80 + (ABS(CHECKSUM(e.EndpointId, t.StartAt)) % 90),
       e.HttpStatus,
       CASE e.HttpStatus WHEN 200 THEN 'OK' ELSE 'Service Unavailable' END,
       CASE e.HttpStatus WHEN 200 THEN 'Healthy' ELSE 'Unhealthy' END,
       CASE e.HttpStatus WHEN 200 THEN 1 ELSE 0 END,
       CASE WHEN e.HttpStatus = 200 THEN 1 ELSE 0 END,
       'application/json',
       CASE WHEN e.Build IS NULL THEN @NoBlockAt ELSE DATEADD(minute, CAST(e.DeployDay * 1440 AS int), @T0) END,
       ISNULL(e.Branch, ''),
       e.Build,
       e.BuildId,
       CASE WHEN e.Build IS NULL THEN NULL
            ELSE LOWER(CONVERT(varchar(40), HASHBYTES('SHA1', CONCAT(e.Application, '|', e.Build)), 2)) END,
       '{}', 0, 0, t.StartAt
FROM @ep e
JOIN ticks t ON t.Day >= e.FromDay AND t.Day < e.ToDay;

PRINT CONCAT('health.HealthReport: ', @@ROWCOUNT, ' demo pings');

-- ---- moveit: the assertions -------------------------------------------------------------
DECLARE @D TABLE (Day int, At datetimeoffset);   -- day -> timestamp at 15:00 UTC (approvals happen in meetings)
INSERT INTO @D SELECT i, DATEADD(hour, 15, DATEADD(day, i, @T0)) FROM (SELECT TOP 71 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS i FROM sys.all_objects) x;

SET IDENTITY_INSERT moveit.Release ON;
INSERT INTO moveit.Release (Id, ApplicationId, Name, Kind, TargetDate, Note, CreatedBy) VALUES
 (1, 1, 'Sprint 42',              'featureset', DATEADD(day, 32, CAST(@T0 AS date)), 'Shipped two days early.',                                  'demo-seed'),
 (2, 1, 'Hotfix: login timeout',  'hotfix',     NULL,                                 'Found in PROD under load; branched from 20260723.2.',        'demo-seed'),
 (3, 1, 'Sprint 43',              'featureset', DATEADD(day, 57, CAST(@T0 AS date)), 'Past target: rolled back from PROD on day 56.',            'demo-seed'),
 (4, 2, 'Sprint 42',              'featureset', DATEADD(day, 30, CAST(@T0 AS date)), 'Deployed to PROD a day before its WidgetCore dependency; never approved.', 'demo-seed'),
 (5, 2, 'Sprint 43',              'featureset', DATEADD(day, 60, CAST(@T0 AS date)), 'In PROD while its WidgetCore dependency is rolled back.',  'demo-seed'),
 (6, 4, 'Q3 rate changes',        'featureset', DATEADD(day, 50, CAST(@T0 AS date)), 'Team A; no health regime - movement is asserted.',         'demo-seed'),
 (7, 5, 'Reporting refresh',      'featureset', DATEADD(day, 49, CAST(@T0 AS date)), 'Rolled back from PROD on day 52.',                         'demo-seed'),
 (8, 3, 'Ledger cleanup',         'featureset', DATEADD(day, 40, CAST(@T0 AS date)), 'App reports no deployment block: build unknown everywhere.','demo-seed'),
 (9, 4, 'Q4 statements',          'featureset', DATEADD(day, 80, CAST(@T0 AS date)), 'Team A; at UAT, unapproved, dependency satisfied: READY.',   'demo-seed'),
 (10,4, 'Q4 letters',             'featureset', DATEADD(day, 85, CAST(@T0 AS date)), 'Team A; at UAT, unapproved, depends on work still with the devs: BLOCKED.', 'demo-seed');
SET IDENTITY_INSERT moveit.Release OFF;

SET IDENTITY_INSERT moveit.WorkItem ON;
INSERT INTO moveit.WorkItem (Id, ReleaseId, Kind, Title, BuiltBy, ExternalRef, IncludedInBuild, FoundInStage, RemovedAt, RemovedNote, CreatedBy) VALUES
 (101, 1, 'feature', 'Underwriting rules v2',            'dev-a', NULL,       '20260706.1', NULL,   NULL, NULL, 'demo-seed'),
 (102, 1, 'feature', 'Rate lookup cache',                'dev-b', NULL,       '20260712.1', NULL,   NULL, NULL, 'demo-seed'),
 (103, 1, 'fix',     'Null ref on empty portfolio',      'dev-a', NULL,       '20260719.1', 'VAL',  NULL, NULL, 'demo-seed'),
 (104, 1, 'feature', 'Bulk export',                      'dev-c', NULL,       '20260715.3', NULL,   (SELECT At FROM @D WHERE Day = 16), 'Pulled after VAL: performance', 'demo-seed'),
 (201, 2, 'fix',     'Login timeout under load',         'dev-b', NULL,       '20260815.1', 'PROD', NULL, NULL, 'demo-seed'),
 (301, 3, 'feature', 'Portfolio API v3',                 'dev-a', NULL,       '20260805.1', NULL,   NULL, NULL, 'demo-seed'),
 (302, 3, 'feature', 'Audit trail',                      'dev-c', NULL,       '20260820.4', NULL,   NULL, NULL, 'demo-seed'),
 (303, 3, 'fix',     'Timezone in scheduled reports',    'dev-b', NULL,       NULL,         'VAL',  NULL, NULL, 'demo-seed'),
 (401, 4, 'feature', 'Portfolio dashboard',              'dev-d', NULL,       '20260718.1', NULL,   NULL, NULL, 'demo-seed'),
 (501, 5, 'feature', 'Audit viewer',                     'dev-d', NULL,       '20260801.1', NULL,   NULL, NULL, 'demo-seed'),
 (601, 6, 'feature', 'Q3 rate tables',                   'dev-e', 'PM-4471',  'J-1187',     NULL,   NULL, NULL, 'demo-seed'),
 (602, 6, 'fix',     'Rounding on blended rates',        'dev-e', 'PM-4502',  'J-1190',     'UAT',  NULL, NULL, 'demo-seed'),
 (701, 7, 'feature', 'Scheduled refresh',                'dev-f', NULL,       '20260720.2', NULL,   NULL, NULL, 'demo-seed'),
 (801, 8, 'feature', 'Ledger archive',                   'dev-g', NULL,       '20260710.1', NULL,   NULL, NULL, 'demo-seed'),
 (901, 9, 'feature', 'Quarterly statement PDF',          'dev-e', 'PM-4610',  'J-1203',     NULL,   NULL, NULL, 'demo-seed'),
 (1001,10,'feature', 'Rate-change letters',              'dev-h', 'PM-4622',  'J-1207',     NULL,   NULL, NULL, 'demo-seed');
SET IDENTITY_INSERT moveit.WorkItem OFF;

INSERT INTO moveit.ReleaseBuild (ReleaseId, Build, Note, CreatedBy) VALUES
 (1, '20260715.3', 'First promotion to VAL',                  'demo-seed'),
 (1, '20260723.2', 'Second promotion; approved; PROD',        'demo-seed'),
 (2, '20260815.1', NULL,                                      'demo-seed'),
 (3, '20260820.4', 'Approved early; rolled back from PROD',   'demo-seed'),
 (4, '20260718.1', NULL,                                      'demo-seed'),
 (5, '20260801.1', NULL,                                      'demo-seed'),
 (6, 'J-1187',     'Jenkins build number, verbatim',          'demo-seed'),
 (6, 'J-1190',     NULL,                                      'demo-seed'),
 (7, '20260720.2', NULL,                                      'demo-seed'),
 (8, '20260710.1', 'No evidence will ever match this: the app reports no block', 'demo-seed'),
 (9, 'J-1203',     NULL,                                      'demo-seed'),
 (10,'J-1207',     NULL,                                      'demo-seed');

INSERT INTO moveit.ReleaseEvent (ReleaseId, Kind, Stage, Build, At, [By], Note, CreatedBy) VALUES
 (1, 'note',              NULL,   NULL,         (SELECT At FROM @D WHERE Day = 14), 'robert', 'Promoted 20260715.3 to VAL; bulk export under review', 'demo-seed'),
 (1, 'verified',          'VAL',  '20260723.2', (SELECT At FROM @D WHERE Day = 27), 'robert', NULL, 'demo-seed'),
 (1, 'approved',          'PROD', '20260723.2', (SELECT At FROM @D WHERE Day = 28), 'robert', 'Client meeting', 'demo-seed'),
 (2, 'approved',          'PROD', '20260815.1', (SELECT At FROM @D WHERE Day = 41), 'robert', 'Emergency approval by phone, recorded after the deploy that morning', 'demo-seed'),
 (3, 'approved',          'PROD', '20260820.4', (SELECT At FROM @D WHERE Day = 54), 'robert', NULL, 'demo-seed'),
 (3, 'hold',              'PROD', '20260820.4', (SELECT At FROM @D WHERE Day = 56), 'robert', 'Rolled back after PROD errors; awaiting fix for timezone defect', 'demo-seed'),
 -- release 4 has NO approval on purpose: its PROD deploy is the 'PROD without approval' fixture
 (5, 'approved',          'PROD', '20260801.1', (SELECT At FROM @D WHERE Day = 57), 'robert', NULL, 'demo-seed'),
 (6, 'deployed-asserted', 'DEV',  'J-1187',     (SELECT At FROM @D WHERE Day = 20), 'robert', 'Per Team A stand-up', 'demo-seed'),
 (6, 'deployed-asserted', 'UAT',  'J-1190',     (SELECT At FROM @D WHERE Day = 35), 'robert', NULL, 'demo-seed'),
 (6, 'approved',          'PROD', 'J-1190',     (SELECT At FROM @D WHERE Day = 45), 'robert', NULL, 'demo-seed'),
 (6, 'deployed-asserted', 'PROD', 'J-1190',     (SELECT At FROM @D WHERE Day = 47), 'robert', 'Infra team confirmed by email', 'demo-seed'),
 (7, 'approved',          'PROD', '20260720.2', (SELECT At FROM @D WHERE Day = 49), 'robert', NULL, 'demo-seed'),
 (7, 'hold',              'PROD', '20260720.2', (SELECT At FROM @D WHERE Day = 52), 'robert', 'Rolled back: refresh job locked the reporting database', 'demo-seed'),
 (8, 'verified',          'VAL',  '20260710.1', (SELECT At FROM @D WHERE Day = 20), 'robert', 'Tester signed off; no evidence available from the app', 'demo-seed'),
 (9, 'deployed-asserted', 'DEV',  'J-1203',     (SELECT At FROM @D WHERE Day = 55), 'robert', NULL, 'demo-seed'),
 (9, 'deployed-asserted', 'UAT',  'J-1203',     (SELECT At FROM @D WHERE Day = 62), 'robert', NULL, 'demo-seed'),
 (10,'deployed-asserted', 'DEV',  'J-1207',     (SELECT At FROM @D WHERE Day = 58), 'robert', NULL, 'demo-seed'),
 (10,'deployed-asserted', 'UAT',  'J-1207',     (SELECT At FROM @D WHERE Day = 65), 'robert', NULL, 'demo-seed');

INSERT INTO moveit.WorkItemLink (WorkItemId, LinkedWorkItemId, Kind, Note, CreatedBy) VALUES
 (401, 101, 'dependsOn', 'Dashboard reads the v2 rules endpoint',   'demo-seed'),
 (501, 302, 'dependsOn', 'Viewer reads the audit trail',            'demo-seed'),
 (701, 301, 'relatedTo', 'Same client ask, different apps',         'demo-seed'),
 (901, 601, 'dependsOn', 'Statements use the Q3 rate tables',       'demo-seed'),
 (1001,303, 'dependsOn', 'Letters need the timezone fix',           'demo-seed');

PRINT 'moveit: 10 releases, 16 work items, 12 attributed builds, 18 events, 5 links';
