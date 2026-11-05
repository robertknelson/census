-- Saves one document as its rows (census-on-apptrak.md §6): rows new to it are created, changed ones updated, those no
-- longer in it deleted, each audited with its value before and after; a row whose value is unchanged is not touched
-- beyond its place. One transaction. Returns how many rows changed.
-- Parameters: @Document, @Rows (a JSON array of { key, sort, value }), @Actor, @ImpersonatedBy.

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @in TABLE (EntityKey nvarchar(400) NOT NULL PRIMARY KEY, Sort int NOT NULL, Value nvarchar(max) NOT NULL);
INSERT @in (EntityKey, Sort, Value)
SELECT EntityKey, Sort, Value
FROM OPENJSON(@Rows) WITH (EntityKey nvarchar(400) '$.key', Sort int '$.sort', Value nvarchar(max) '$.value');

IF EXISTS (SELECT 1 FROM @in WHERE ISJSON(Value) = 0)
    THROW 50400, 'A unit of the document is not JSON.', 1;

BEGIN TRANSACTION;

DECLARE @now TABLE (EntityKey nvarchar(400) NOT NULL PRIMARY KEY, Value nvarchar(max) NOT NULL);
INSERT @now (EntityKey, Value)
SELECT EntityKey, Value FROM census.Assertion WITH (UPDLOCK, HOLDLOCK) WHERE Document = @Document;

INSERT census.AssertionAudit (Document, EntityKey, Action, PreviousValue, NewValue, ChangedBy, ImpersonatedBy)
SELECT @Document, i.EntityKey, 'created', NULL, i.Value, @Actor, @ImpersonatedBy
FROM @in i WHERE NOT EXISTS (SELECT 1 FROM @now n WHERE n.EntityKey = i.EntityKey)
UNION ALL
SELECT @Document, i.EntityKey, 'updated', n.Value, i.Value, @Actor, @ImpersonatedBy
FROM @in i JOIN @now n ON n.EntityKey = i.EntityKey WHERE n.Value <> i.Value COLLATE Latin1_General_BIN2
UNION ALL
SELECT @Document, n.EntityKey, 'deleted', n.Value, NULL, @Actor, @ImpersonatedBy
FROM @now n WHERE NOT EXISTS (SELECT 1 FROM @in i WHERE i.EntityKey = n.EntityKey);

DECLARE @changed int = @@ROWCOUNT;

DELETE a FROM census.Assertion a
WHERE a.Document = @Document AND NOT EXISTS (SELECT 1 FROM @in i WHERE i.EntityKey = a.EntityKey);

UPDATE a SET a.Value = i.Value, a.Sort = i.Sort,
             a.UpdatedAt = CASE WHEN a.Value <> i.Value COLLATE Latin1_General_BIN2 THEN SYSDATETIMEOFFSET() ELSE a.UpdatedAt END,
             a.UpdatedBy = CASE WHEN a.Value <> i.Value COLLATE Latin1_General_BIN2 THEN @Actor ELSE a.UpdatedBy END
FROM census.Assertion a JOIN @in i ON i.EntityKey = a.EntityKey
WHERE a.Document = @Document AND (a.Value <> i.Value COLLATE Latin1_General_BIN2 OR a.Sort <> i.Sort);

INSERT census.Assertion (Document, EntityKey, Sort, Value, UpdatedBy)
SELECT @Document, i.EntityKey, i.Sort, i.Value, @Actor
FROM @in i WHERE NOT EXISTS (SELECT 1 FROM census.Assertion a WHERE a.Document = @Document AND a.EntityKey = i.EntityKey);

COMMIT;

SELECT @changed AS Changed;
