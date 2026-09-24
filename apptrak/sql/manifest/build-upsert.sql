-- One attributed build, keyed by (ReleaseId, Build) — the table's unique constraint.
-- Only the note can change; the attribution itself is never deleted here. A null @Note
-- leaves the stored note alone: the entry page (move-it.md §15) has no note field and must
-- not erase what a manifest or an earlier entry wrote. To clear a note, send ''.
DECLARE @id int = (SELECT Id FROM moveit.ReleaseBuild WHERE ReleaseId = @ReleaseId AND Build = @Build);

IF @id IS NULL
BEGIN
    INSERT moveit.ReleaseBuild (ReleaseId, Build, Note, CreatedBy) VALUES (@ReleaseId, @Build, NULLIF(@Note, ''), @By);
    SELECT CAST(SCOPE_IDENTITY() AS int) AS Id, 'inserted' AS Outcome;
END
ELSE IF @Note IS NOT NULL AND EXISTS (SELECT Note FROM moveit.ReleaseBuild WHERE Id = @id EXCEPT SELECT NULLIF(@Note, ''))
BEGIN
    UPDATE moveit.ReleaseBuild SET Note = NULLIF(@Note, '') WHERE Id = @id;
    SELECT @id AS Id, 'updated' AS Outcome;
END
ELSE
    SELECT @id AS Id, 'unchanged' AS Outcome;
