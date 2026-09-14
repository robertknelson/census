-- Reference rows for moveit in core.SelectItem, keyed by (Grouping, Identifier).
-- Reference data, not demo data: these are the same in every environment.
--
-- Stage.Sort is the sequence: DEV, VAL and UAT are peers (VAL is Team B's, UAT is Team A's),
-- PROD above. "Highest stage" and "skipped a stage" read Sort.
--
-- Idempotent: MERGE, safe to re-run. Adding a kind later is a row here, not DDL.

MERGE core.SelectItem AS t
USING (VALUES
    -- Grouping,      Identifier,          Display,               Description,                                                    Sort
    ('Stage',         'DEV',               'DEV',                 'Development stage; builds land continuously during a sprint',   10),
    ('Stage',         'VAL',               'VAL',                 'Validation stage (Team B)',                                     20),
    ('Stage',         'UAT',               'UAT',                 'User acceptance stage (Team A)',                                20),
    ('Stage',         'PROD',              'PROD',                'Production',                                                    30),

    ('ReleaseKind',   'featureset',        'Feature set',         'The sprint''s planned work for one application',                10),
    ('ReleaseKind',   'hotfix',            'Hotfix',              'A fix that skipped the development phase, branched from PROD',  20),

    ('WorkItemKind',  'feature',           'Feature',             'New or changed behaviour',                                      10),
    ('WorkItemKind',  'fix',               'Fix',                 'Correction of a defect',                                        20),

    ('LinkKind',      'dependsOn',         'Depends on',          'Directed: the linked item must be deployed first',              10),
    ('LinkKind',      'relatedTo',         'Related to',          'Undirected: these go together',                                 20),

    ('EventKind',     'approved',          'Approved',            'Client approval to deploy the named build to the named stage',  10),
    ('EventKind',     'verified',          'Verified',            'Testing signed off in the named stage',                         20),
    ('EventKind',     'hold',              'On hold',             'Release parked; Note carries the reason',                       30),
    ('EventKind',     'resumed',           'Resumed',             'Hold lifted',                                                   40),
    ('EventKind',     'note',              'Note',                'Free text against the release at a moment in time',             50),
    ('EventKind',     'abandoned',         'Abandoned',           'Release will not ship',                                         60),
    ('EventKind',     'deployed-asserted', 'Deployed (asserted)', 'Human statement of a deployment for an app with no health regime; declared, never counted as observed', 70)
) AS s (Grouping, Identifier, Display, Description, Sort)
    ON t.Grouping = s.Grouping AND t.Identifier = s.Identifier
WHEN MATCHED AND (t.Display <> s.Display OR t.Description <> s.Description OR t.Sort <> s.Sort) THEN
    UPDATE SET Display = s.Display, Description = s.Description, Sort = s.Sort
WHEN NOT MATCHED THEN
    INSERT (Identifier, Display, Description, Sort, IsShow, MasterId, Grouping)
    VALUES (s.Identifier, s.Display, s.Description, s.Sort, 1, -1, s.Grouping);
