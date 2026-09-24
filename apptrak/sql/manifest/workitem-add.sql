-- The notebook's entry (move-it.md 20): a feature or fix heard about for an application,
-- with no release yet. Keyed by (ApplicationId, Title) among no-release items; inserted or
-- unchanged, never updated - the note is what was heard, not a field to maintain.
DECLARE @id int = (SELECT Id FROM moveit.WorkItem WHERE ApplicationId = @ApplicationId AND ReleaseId IS NULL AND Title = @Title);

IF @id IS NULL
BEGIN
    INSERT moveit.WorkItem (ApplicationId, ReleaseId, Kind, Title, Description, CreatedBy)
    VALUES (@ApplicationId, NULL, @Kind, @Title, @Description, @By);
    SELECT CAST(SCOPE_IDENTITY() AS int) AS Id, 'inserted' AS Outcome;
END
ELSE
    SELECT @id AS Id, 'unchanged' AS Outcome;
