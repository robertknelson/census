-- Add or correct one of an application's parts, audited, in one transaction (@Part):
--   role     ApplicationRole (which member-types role it uses, and what it calls it): @RoleId, @Alias;
--            @OldKey the role being corrected (NULL to add)
--   stage    ApplicationStage (a stage it deploys to, and its own name for it): @StageId, @Name;
--            @OldKey the stage being corrected
--   service  ApplicationService (a service it carries, from when, in what state): @ServiceTypeId,
--            @StartOn, @Status; @OldKey the service row's Id (NULL to add)
-- Keys: the tables' own (role and stage once per application). Audit entity application-<part>,
-- key '<application>:<role | stage | service id>'. THROW 50404: unknown; 50409: already there.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM membership.Application WHERE Id = @ApplicationId) THROW 50404, 'That application no longer exists.', 1;

DECLARE @prev nvarchar(max) = NULL, @new nvarchar(max), @key int;

IF @Part = 'role'
BEGIN
    IF NOT EXISTS (SELECT 1 FROM core.SelectItem x JOIN core.SelectItem h ON h.Id = x.MasterId AND h.MasterId = -1 AND h.Identifier = 'member-types' WHERE x.Id = @RoleId)
        THROW 50404, 'That role is not in member-types.', 1;
    IF EXISTS (SELECT 1 FROM membership.ApplicationRole WHERE ApplicationRole = @ApplicationId AND RoleId = @RoleId AND (@OldKey IS NULL OR RoleId <> @OldKey))
        THROW 50409, 'The application already uses that role.', 1;
    IF @OldKey IS NOT NULL
    BEGIN
        SET @prev = (SELECT ApplicationRole AS ApplicationId, RoleId, Alias FROM membership.ApplicationRole WHERE ApplicationRole = @ApplicationId AND RoleId = @OldKey FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        IF @prev IS NULL THROW 50404, 'That role is no longer on the application.', 1;
        UPDATE membership.ApplicationRole SET RoleId = @RoleId, Alias = @Alias WHERE ApplicationRole = @ApplicationId AND RoleId = @OldKey;
    END
    ELSE INSERT membership.ApplicationRole (ApplicationRole, RoleId, Alias) VALUES (@ApplicationId, @RoleId, @Alias);
    SET @key = @RoleId;
    SET @new = (SELECT ApplicationRole AS ApplicationId, RoleId, Alias FROM membership.ApplicationRole WHERE ApplicationRole = @ApplicationId AND RoleId = @RoleId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
END
ELSE IF @Part = 'stage'
BEGIN
    IF NOT EXISTS (SELECT 1 FROM core.SelectItem x JOIN core.SelectItem h ON h.Id = x.MasterId AND h.MasterId = -1 AND h.Identifier = 'stages' WHERE x.Id = @StageId)
        THROW 50404, 'That stage is not in stages.', 1;
    IF EXISTS (SELECT 1 FROM membership.ApplicationStage WHERE ApplicationId = @ApplicationId AND StageId = @StageId AND (@OldKey IS NULL OR StageId <> @OldKey))
        THROW 50409, 'The application already has that stage.', 1;
    IF @OldKey IS NOT NULL
    BEGIN
        SET @prev = (SELECT ApplicationId, StageId, Name FROM membership.ApplicationStage WHERE ApplicationId = @ApplicationId AND StageId = @OldKey FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        IF @prev IS NULL THROW 50404, 'That stage is no longer on the application.', 1;
        UPDATE membership.ApplicationStage SET StageId = @StageId, Name = @Name WHERE ApplicationId = @ApplicationId AND StageId = @OldKey;
    END
    ELSE INSERT membership.ApplicationStage (ApplicationId, StageId, Name) VALUES (@ApplicationId, @StageId, @Name);
    SET @key = @StageId;
    SET @new = (SELECT ApplicationId, StageId, Name FROM membership.ApplicationStage WHERE ApplicationId = @ApplicationId AND StageId = @StageId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
END
ELSE IF @Part = 'service'
BEGIN
    IF NOT EXISTS (SELECT 1 FROM core.SelectItem x JOIN core.SelectItem h ON h.Id = x.MasterId AND h.MasterId = -1 AND h.Identifier = 'service-types' WHERE x.Id = @ServiceTypeId)
        THROW 50404, 'That service type is not in service-types.', 1;
    IF @OldKey IS NOT NULL
    BEGIN
        SET @prev = (SELECT Id, ApplicationId, ServiceTypeId, StartOn, Status FROM membership.ApplicationService WHERE Id = @OldKey AND ApplicationId = @ApplicationId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        IF @prev IS NULL THROW 50404, 'That service is no longer on the application.', 1;
        UPDATE membership.ApplicationService SET ServiceTypeId = @ServiceTypeId, StartOn = @StartOn, Status = @Status WHERE Id = @OldKey;
        SET @key = @OldKey;
    END
    ELSE
    BEGIN
        INSERT membership.ApplicationService (ApplicationId, ServiceTypeId, StartOn, Status) VALUES (@ApplicationId, @ServiceTypeId, @StartOn, @Status);
        SET @key = CAST(SCOPE_IDENTITY() AS int);
    END
    SET @new = (SELECT Id, ApplicationId, ServiceTypeId, StartOn, Status FROM membership.ApplicationService WHERE Id = @key FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
END
ELSE THROW 50404, 'Unknown part.', 1;

INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy, ImpersonatedBy)
VALUES ('application-' + @Part, CONCAT(@ApplicationId, ':', @key), CASE WHEN @prev IS NULL THEN 'created' ELSE 'updated' END, @prev, @new, @Actor, @ImpersonatedBy);

COMMIT;
SELECT CONCAT(@ApplicationId, ':', @key) AS PartKey;
