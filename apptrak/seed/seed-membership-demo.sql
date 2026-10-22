-- Membership fixtures for the persona UX (personas.md §7). FABRICATED, and it stays fabricated:
-- no real membership data can reach this environment. The real AppTrak has its own members;
-- this file never runs there.
--
-- Idempotent: demo rows are marked (Member.Identifier 'demo-%', Application.Tags 'demo') and
-- deleted first. Rows made by hand are never touched: applications 2 and 3 exist locally as
-- hand-made rows (My WebApp, Your WebApp) and keep their names; the seed only adds the fixture
-- applications that are missing (1, 4, 5 — moveit.ApplicationId is membership.Application.Id,
-- personas.md §3) and Census itself.
--
-- Coverage (member -> what it exercises, personas.md §4):
--   demo-sam    system-administrator on Census     estate-wide, every feature
--   demo-ellen  executive on Census                estate-wide, read at every grain
--   demo-paula  product-owner on 1 and 5           executive views, trimmed to two
--   demo-terry  technical-lead on 1 and 2          quarter down, drill-down, two applications
--   demo-ada    application-administrator on 3     delegated curation on one application
--   demo-max    product-owner on 4, technical-lead on 5   mixed: each application at its own depth
--   demo-otto   observer on Census                 view only - later, so no features yet
--   demo-nova   no roles                           a member who sees nothing
--
-- Run order: after 003 (core.SelectItem's member-types list must exist). Invoke-AppTrakDemo.ps1.

SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @T0 datetimeoffset = '2026-07-06T00:00:00+00:00';   -- the demo window's day 0 (seed-apptrak-demo.sql)
BEGIN TRANSACTION;

-- The Executive role: in the real database's member-types list (Robert, 2026-10-22), not yet
-- in the local one. Insert-only. Its Identifier is assumed (personas.md P2).
INSERT core.SelectItem (Identifier, Display, Description, Sort, IsShow, MasterId, Grouping)
SELECT 'executive', 'Executive', 'Executive', -1, 1, h.Id, NULL
FROM core.SelectItem h
WHERE h.MasterId = -1 AND h.Identifier = 'member-types'
  AND NOT EXISTS (SELECT 1 FROM core.SelectItem x WHERE x.MasterId = h.Id AND x.Identifier = 'executive');

DELETE FROM membership.MemberApplicationRole WHERE MemberId IN (SELECT Id FROM membership.Member WHERE Identifier LIKE 'demo-%');
DELETE FROM membership.MemberApplicationRole WHERE ApplicationId IN (SELECT Id FROM membership.Application WHERE Tags = 'demo');
DELETE FROM membership.Member WHERE Identifier LIKE 'demo-%';
DELETE FROM membership.Application WHERE Tags = 'demo';

DECLARE @website int = (SELECT x.Id FROM core.SelectItem x JOIN core.SelectItem h ON h.Id = x.MasterId
                        WHERE h.Identifier = 'application-types' AND x.Identifier = 'website');

-- Census is an application like any other; a role held on it is estate-wide (personas.md §4).
-- Its Identifier is the setting Personas:EstateApplication. Fixed id 100, clear of the fixtures.
SET IDENTITY_INSERT membership.Application ON;
INSERT membership.Application (Id, Identifier, Name, Tags, Disposition, ApplicationTypeId)
SELECT a.Id, a.Identifier, a.Name, 'demo', 'current', @website
FROM (VALUES (1,   'widgetcore',      'WidgetCore'),
             (4,   'mortgagegateway', 'MortgageGateway'),
             (5,   'reporting',       'Reporting'),
             (100, 'census',          'Census')) a (Id, Identifier, Name)
WHERE NOT EXISTS (SELECT 1 FROM membership.Application x WHERE x.Id = a.Id);
SET IDENTITY_INSERT membership.Application OFF;

INSERT membership.Member (Identifier, WindowsIdentity, FirstName, LastName, Email, CreatedAt)
VALUES ('demo-sam',   'DEMO\sam',   'Sam',   'Admin',     'sam@example.com', @T0),
       ('demo-ellen', 'DEMO\ellen', 'Ellen', 'Exec',      'ellen@example.com', @T0),
       ('demo-paula', 'DEMO\paula', 'Paula', 'Product',   'paula@example.com', @T0),
       ('demo-terry', 'DEMO\terry', 'Terry', 'Tech',      'terry@example.com', @T0),
       ('demo-ada',   'DEMO\ada',   'Ada',   'AppAdmin',  'ada@example.com', @T0),
       ('demo-max',   'DEMO\max',   'Max',   'Mixed',     'max@example.com', @T0),
       ('demo-otto',  'DEMO\otto',  'Otto',  'Observer',  'otto@example.com', @T0),
       ('demo-nova',  'DEMO\nova',  'Nova',  'Nobody',    'nova@example.com', @T0);

INSERT membership.MemberApplicationRole (MemberId, ApplicationId, RoleId)
SELECT m.Id, a.Id, r.Id
FROM (VALUES ('demo-sam',   'census',          'system-administrator'),
             ('demo-ellen', 'census',          'executive'),
             ('demo-paula', 'widgetcore',      'product-owner'),
             ('demo-paula', 'reporting',       'product-owner'),
             ('demo-terry', 'widgetcore',      'technical-lead'),
             ('demo-max',   'mortgagegateway', 'product-owner'),
             ('demo-max',   'reporting',       'technical-lead'),
             ('demo-otto',  'census',          'observer')) g (Member, Application, Role)
JOIN membership.Member m ON m.Identifier = g.Member
JOIN membership.Application a ON a.Identifier = g.Application
JOIN core.SelectItem h ON h.MasterId = -1 AND h.Identifier = 'member-types'
JOIN core.SelectItem r ON r.MasterId = h.Id AND r.Identifier = g.Role;

-- The two grants on hand-made applications go by id: 2 for Terry, 3 for Ada.
INSERT membership.MemberApplicationRole (MemberId, ApplicationId, RoleId)
SELECT m.Id, g.ApplicationId, r.Id
FROM (VALUES ('demo-terry', 2, 'technical-lead'),
             ('demo-ada',   3, 'application-administrator')) g (Member, ApplicationId, Role)
JOIN membership.Member m ON m.Identifier = g.Member
JOIN membership.Application a ON a.Id = g.ApplicationId
JOIN core.SelectItem h ON h.MasterId = -1 AND h.Identifier = 'member-types'
JOIN core.SelectItem r ON r.MasterId = h.Id AND r.Identifier = g.Role;

COMMIT;
