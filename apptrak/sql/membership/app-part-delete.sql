-- Remove one of an application's parts (@Part role | stage | service; @PartKey the role, stage or service
-- row Id), audited with the row, in one transaction. THROW 50404: gone.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @prev nvarchar(max);
IF @Part = 'role'
BEGIN
    SET @prev = (SELECT ApplicationRole AS ApplicationId, RoleId, Alias FROM membership.ApplicationRole WHERE ApplicationRole = @ApplicationId AND RoleId = @PartKey FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    DELETE FROM membership.ApplicationRole WHERE ApplicationRole = @ApplicationId AND RoleId = @PartKey;
END
ELSE IF @Part = 'stage'
BEGIN
    SET @prev = (SELECT ApplicationId, StageId, Name FROM membership.ApplicationStage WHERE ApplicationId = @ApplicationId AND StageId = @PartKey FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    DELETE FROM membership.ApplicationStage WHERE ApplicationId = @ApplicationId AND StageId = @PartKey;
END
ELSE IF @Part = 'service'
BEGIN
    SET @prev = (SELECT Id, ApplicationId, ServiceTypeId, StartOn, Status FROM membership.ApplicationService WHERE Id = @PartKey AND ApplicationId = @ApplicationId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    DELETE FROM membership.ApplicationService WHERE Id = @PartKey AND ApplicationId = @ApplicationId;
END

IF @prev IS NULL THROW 50404, 'That is no longer on the application.', 1;

INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy, ImpersonatedBy)
VALUES ('application-' + @Part, CONCAT(@ApplicationId, ':', @PartKey), 'deleted', @prev, NULL, @Actor, @ImpersonatedBy);

COMMIT;
SELECT CONCAT(@ApplicationId, ':', @PartKey) AS PartKey;
