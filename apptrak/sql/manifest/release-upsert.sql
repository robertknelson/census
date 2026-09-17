-- One release, keyed by (ApplicationId, Name). Scalars follow the manifest; the row is
-- never deleted. Returns Id and what happened.
DECLARE @id int = (SELECT Id FROM moveit.Release WHERE ApplicationId = @ApplicationId AND Name = @Name);

IF @id IS NULL
BEGIN
    INSERT moveit.Release (ApplicationId, Name, Kind, TargetDate, Note, CreatedBy)
    VALUES (@ApplicationId, @Name, @Kind, @TargetDate, @Note, @By);
    SELECT CAST(SCOPE_IDENTITY() AS int) AS Id, 'inserted' AS Outcome;
END
ELSE IF EXISTS (SELECT Kind, TargetDate, Note FROM moveit.Release WHERE Id = @id
                EXCEPT SELECT @Kind, @TargetDate, @Note)
BEGIN
    UPDATE moveit.Release SET Kind = @Kind, TargetDate = @TargetDate, Note = @Note WHERE Id = @id;
    SELECT @id AS Id, 'updated' AS Outcome;
END
ELSE
    SELECT @id AS Id, 'unchanged' AS Outcome;
