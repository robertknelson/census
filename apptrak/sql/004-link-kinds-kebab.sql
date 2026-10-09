-- One-off, idempotent: the two link-kinds members were ratified camelCase (dependsOn,
-- relatedTo) and renamed kebab-case on 2026-10-09 (depends-on, related-to), like every
-- other identifier in core.SelectItem. 003-lookups is insert-only, so on a database that ran
-- the old 003 it adds the kebab rows beside the camel ones. This script leaves one kebab row
-- per kind — renaming the camel row where no kebab row exists, deleting it where one does —
-- and moves every moveit.WorkItemLink.Kind that stores the old spelling. Nothing references a
-- lookup row by Id; the Kind columns store the identifier. A database already renamed is
-- untouched. Run once after 003, in either order; a fresh database needs only 003.

SET NOCOUNT ON;

DECLARE @r TABLE (OldId nvarchar(50), NewId nvarchar(50));
INSERT @r VALUES ('dependsOn', 'depends-on'), ('relatedTo', 'related-to');

DECLARE @h int = (SELECT Id FROM core.SelectItem WHERE MasterId = -1 AND Identifier = 'link-kinds');

UPDATE l SET Kind = r.NewId
FROM moveit.WorkItemLink l
JOIN @r r ON r.OldId = l.Kind;
PRINT 'moveit.WorkItemLink.Kind moved: ' + CAST(@@ROWCOUNT AS varchar(10));

-- the kebab row is absent: the camel row becomes it (the lowest Id, should there be two)
UPDATE x SET Identifier = r.NewId
FROM core.SelectItem x
JOIN @r r ON r.OldId = x.Identifier
WHERE x.MasterId = @h
  AND x.Id = (SELECT MIN(o.Id) FROM core.SelectItem o WHERE o.MasterId = @h AND o.Identifier = r.OldId)
  AND NOT EXISTS (SELECT 1 FROM core.SelectItem d WHERE d.MasterId = @h AND d.Identifier = r.NewId);
PRINT 'core.SelectItem link-kinds renamed: ' + CAST(@@ROWCOUNT AS varchar(10));

-- the kebab row is present (003 ran first, or the rename above): the camel row is surplus
DELETE x
FROM core.SelectItem x
JOIN @r r ON r.OldId = x.Identifier
WHERE x.MasterId = @h;
PRINT 'core.SelectItem link-kinds camel rows removed: ' + CAST(@@ROWCOUNT AS varchar(10));
