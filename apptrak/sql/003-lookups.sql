-- Reference rows for moveit in core.SelectItem, in AppTrak's own shape (move-it.md 10, item 18):
-- a list is a header row (MasterId = -1, Identifier = the list name, kebab-case); its members
-- carry MasterId = the header's Id. Grouping only groups options inside a dropdown and is
-- left NULL. AppTrak reads a list as:
--   SELECT x.* FROM core.SelectItem x JOIN core.SelectItem y ON x.MasterId = y.Id
--   WHERE y.Identifier = 'release-kinds' AND x.IsShow = 1 ORDER BY x.Sort
--
-- Four lists: release-kinds, work-item-kinds, link-kinds, event-kinds. No stage list: AppTrak
-- already has one (header 'stages'); the questions read it and this script never writes it.
--
-- Insert-only and idempotent: a header or member that exists is never changed, whatever it
-- holds. Adding a kind later is a row here, not DDL.

SET NOCOUNT ON;

DECLARE @m TABLE (List nvarchar(50), Identifier nvarchar(50), Display nvarchar(50), Description nvarchar(255), Sort int);
INSERT @m VALUES
    -- List,             Identifier,          Display,               Description,                                                    Sort
    ('release-kinds',     'featureset',        'Feature set',         'The sprint''s planned work for one application',                10),
    ('release-kinds',     'hotfix',            'Hotfix',              'A fix that skipped the development phase, branched from PROD',  20),

    ('work-item-kinds',   'feature',           'Feature',             'New or changed behaviour',                                      10),
    ('work-item-kinds',   'fix',               'Fix',                 'Correction of a defect',                                        20),

    ('link-kinds',        'dependsOn',         'Depends on',          'Directed: the linked item must be deployed first',              10),
    ('link-kinds',        'relatedTo',         'Related to',          'Undirected: these go together',                                 20),

    ('event-kinds',       'approved',          'Approved',            'Client approval to deploy the named build to the named stage',  10),
    ('event-kinds',       'verified',          'Verified',            'Testing signed off in the named stage',                         20),
    ('event-kinds',       'hold',              'On hold',             'Release parked; Note carries the reason',                       30),
    ('event-kinds',       'resumed',           'Resumed',             'Hold lifted',                                                   40),
    ('event-kinds',       'note',              'Note',                'Free text against the release at a moment in time',             50),
    ('event-kinds',       'abandoned',         'Abandoned',           'Release will not ship',                                         60),
    ('event-kinds',       'deployed-asserted', 'Deployed (asserted)', 'Human statement of a deployment for an app with no health regime; declared, never counted as observed', 70),
    ('event-kinds',       'build-released',    'Build released',      'A build claim removed from the release by hand (move-it.md 29); Build names it, Note says why', 80);

-- headers
INSERT core.SelectItem (Identifier, Display, Description, Sort, IsShow, MasterId, Grouping)
SELECT l.List, l.List, 'Move It list', 0, 1, -1, NULL
FROM (SELECT DISTINCT List FROM @m) l
WHERE NOT EXISTS (SELECT 1 FROM core.SelectItem h WHERE h.MasterId = -1 AND h.Identifier = l.List);

-- members
INSERT core.SelectItem (Identifier, Display, Description, Sort, IsShow, MasterId, Grouping)
SELECT m.Identifier, m.Display, m.Description, m.Sort, 1, h.Id, NULL
FROM @m m
JOIN core.SelectItem h ON h.MasterId = -1 AND h.Identifier = m.List
WHERE NOT EXISTS (SELECT 1 FROM core.SelectItem x WHERE x.MasterId = h.Id AND x.Identifier = m.Identifier);

PRINT 'core.SelectItem: ' + CAST(@@ROWCOUNT AS varchar(10)) + ' members inserted';
