-- Census's own assertion layer in AppTrak (census-on-apptrak.md §6, D-002). One row per unit a person asserts in a
-- config document (a tagged entity, a system, a baseline), keyed by its path in the document as a JSON array of
-- names, its value the unit's JSON; the row keyed [] holds the rest of the document. Every change is audited in the
-- PreviousValue / NewValue pattern, which takes the place git's history had for the files.
-- Both tables are assertions, so the reset wipes them (reset.AssertedTable, when the reset is installed).
-- Idempotent. SQL Server 2019.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF SCHEMA_ID('census') IS NULL EXEC ('CREATE SCHEMA census');

IF OBJECT_ID('census.Assertion', 'U') IS NULL
BEGIN
    CREATE TABLE census.Assertion (
        Document   varchar(50)    NOT NULL,   -- entity-tags | systems | stage-crossings | ... (AssertionDocuments)
        EntityKey  nvarchar(400)  NOT NULL,   -- ["databases","SQL01","MSSQLSERVER","MyDB"], or [] for the root
        Sort       int            NOT NULL,   -- the unit's place in the document
        Value      nvarchar(max)  NOT NULL,   -- the unit's JSON
        UpdatedAt  datetimeoffset NOT NULL CONSTRAINT DF_Assertion_UpdatedAt DEFAULT (SYSDATETIMEOFFSET()),
        UpdatedBy  nvarchar(100)  NOT NULL,
        CONSTRAINT PK_Assertion PRIMARY KEY (Document, EntityKey),
        CONSTRAINT CK_Assertion_Value CHECK (ISJSON(Value) = 1)
    );
END;

IF OBJECT_ID('census.AssertionAudit', 'U') IS NULL
BEGIN
    CREATE TABLE census.AssertionAudit (
        AssertionAuditId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_AssertionAudit PRIMARY KEY,
        Document         varchar(50)    NOT NULL,
        EntityKey        nvarchar(400)  NOT NULL,
        Action           varchar(30)    NOT NULL,   -- created | updated | deleted
        PreviousValue    nvarchar(max)  NULL,
        NewValue         nvarchar(max)  NULL,
        ChangedBy        nvarchar(100)  NOT NULL,
        ImpersonatedBy   nvarchar(100)  NULL,
        ChangedAt        datetimeoffset NOT NULL CONSTRAINT DF_AssertionAudit_ChangedAt DEFAULT (SYSDATETIMEOFFSET())
    );
    CREATE INDEX IX_AssertionAudit_Entity ON census.AssertionAudit (Document, EntityKey, ChangedAt);
END;

IF OBJECT_ID('reset.AssertedTable', 'U') IS NOT NULL
    MERGE reset.AssertedTable AS t
    USING (VALUES
        ('census.Assertion',      70, N'Census: tags, systems, baselines and the rest of its own assertions'),
        ('census.AssertionAudit', 80, N'Census: the history of changes to the rows above')
    ) AS s (TableName, WipeOrder, Note)
    ON t.TableName = s.TableName
    WHEN NOT MATCHED THEN INSERT (TableName, WipeOrder, Note) VALUES (s.TableName, s.WipeOrder, s.Note);
