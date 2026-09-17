-- One human event, keyed by (ReleaseId, Kind, Stage, Build, At). Events are history:
-- inserted if absent, never updated, never deleted. A corrected event is a new row.
IF EXISTS (SELECT Kind, Stage, Build, At FROM moveit.ReleaseEvent WHERE ReleaseId = @ReleaseId
           INTERSECT SELECT @Kind, @Stage, @Build, @At)
    SELECT 'unchanged' AS Outcome;
ELSE
BEGIN
    INSERT moveit.ReleaseEvent (ReleaseId, Kind, Stage, Build, At, [By], Note, CreatedBy)
    VALUES (@ReleaseId, @Kind, @Stage, @Build, @At, @EventBy, @Note, @By);
    SELECT 'inserted' AS Outcome;
END
