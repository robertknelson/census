-- One work item, keyed by (ReleaseId, Title). Scalars follow the manifest; the row is
-- never deleted (a title gone from the manifest is reported, not removed).
DECLARE @id int = (SELECT Id FROM moveit.WorkItem WHERE ReleaseId = @ReleaseId AND Title = @Title);

IF @id IS NULL
BEGIN
    INSERT moveit.WorkItem (ReleaseId, Kind, Title, Description, BuiltBy, ExternalRef, IncludedInBuild, FoundInStage, RemovedAt, RemovedNote, CreatedBy)
    VALUES (@ReleaseId, @Kind, @Title, @Description, @BuiltBy, @ExternalRef, @IncludedInBuild, @FoundInStage, @RemovedAt, @RemovedNote, @By);
    SELECT CAST(SCOPE_IDENTITY() AS int) AS Id, 'inserted' AS Outcome;
END
ELSE IF EXISTS (SELECT Kind, Description, BuiltBy, ExternalRef, IncludedInBuild, FoundInStage, RemovedAt, RemovedNote
                FROM moveit.WorkItem WHERE Id = @id
                EXCEPT SELECT @Kind, @Description, @BuiltBy, @ExternalRef, @IncludedInBuild, @FoundInStage, @RemovedAt, @RemovedNote)
BEGIN
    UPDATE moveit.WorkItem
    SET Kind = @Kind, Description = @Description, BuiltBy = @BuiltBy, ExternalRef = @ExternalRef,
        IncludedInBuild = @IncludedInBuild, FoundInStage = @FoundInStage, RemovedAt = @RemovedAt, RemovedNote = @RemovedNote
    WHERE Id = @id;
    SELECT @id AS Id, 'updated' AS Outcome;
END
ELSE
    SELECT @id AS Id, 'unchanged' AS Outcome;
