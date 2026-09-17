-- One attributed build, keyed by (ReleaseId, Build) — the table's unique constraint.
-- Only the note can change; the attribution itself is never deleted here.
DECLARE @id int = (SELECT Id FROM moveit.ReleaseBuild WHERE ReleaseId = @ReleaseId AND Build = @Build);

IF @id IS NULL
BEGIN
    INSERT moveit.ReleaseBuild (ReleaseId, Build, Note, CreatedBy) VALUES (@ReleaseId, @Build, @Note, @By);
    SELECT CAST(SCOPE_IDENTITY() AS int) AS Id, 'inserted' AS Outcome;
END
ELSE IF EXISTS (SELECT Note FROM moveit.ReleaseBuild WHERE Id = @id EXCEPT SELECT @Note)
BEGIN
    UPDATE moveit.ReleaseBuild SET Note = @Note WHERE Id = @id;
    SELECT @id AS Id, 'updated' AS Outcome;
END
ELSE
    SELECT @id AS Id, 'unchanged' AS Outcome;
