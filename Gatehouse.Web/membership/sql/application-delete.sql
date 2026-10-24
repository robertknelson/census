-- Delete one application from the membership page, audited with everything that hung off it, in one
-- transaction: its grants, the roles it uses, its stages, its services. Refused while Move It or the
-- health pings still name it: deleting it then would orphan their rows; retire it instead (or move
-- or delete its releases first). THROW 50404: gone; 50409: still in use.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM membership.Application WHERE Id = @Id) THROW 50404, 'That application no longer exists.', 1;
-- Gatehouse: Move It and the health pings are Census's tables; counted only where they exist.
DECLARE @releases int = 0, @items int = 0, @endpoints int = 0;
IF OBJECT_ID('moveit.Release', 'U') IS NOT NULL SET @releases = (SELECT COUNT(*) FROM moveit.Release WHERE ApplicationId = @Id);
IF OBJECT_ID('moveit.WorkItem', 'U') IS NOT NULL SET @items = (SELECT COUNT(*) FROM moveit.WorkItem WHERE ApplicationId = @Id);
IF OBJECT_ID('health.HealthEndpoint', 'U') IS NOT NULL SET @endpoints = (SELECT COUNT(*) FROM health.HealthEndpoint WHERE ApplicationId = @Id);
IF @releases + @items + @endpoints > 0
BEGIN
    DECLARE @why nvarchar(400) = CONCAT('Still in use: ', @releases, ' release(s), ', @items, ' feature(s) or fix(es), ', @endpoints,
        ' health endpoint(s) name it. Retire it (Disposition), or move or delete those first.');
    THROW 50409, @why, 1;
END

DECLARE @prev nvarchar(max) = (
    SELECT a.Id, a.Identifier, a.Name, a.Tags, a.Disposition, a.ApplicationTypeId, JSON_QUERY(a.Settings) AS Settings,
           (SELECT g.MemberId, g.RoleId FROM membership.MemberApplicationRole g WHERE g.ApplicationId = a.Id FOR JSON PATH) AS Grants,
           (SELECT r.RoleId, r.Alias FROM membership.ApplicationRole r WHERE r.ApplicationRole = a.Id FOR JSON PATH) AS Roles,
           (SELECT s.StageId, s.Name FROM membership.ApplicationStage s WHERE s.ApplicationId = a.Id FOR JSON PATH) AS Stages,
           (SELECT v.Id, v.ServiceTypeId, v.StartOn, v.Status FROM membership.ApplicationService v WHERE v.ApplicationId = a.Id FOR JSON PATH) AS Services
    FROM membership.Application a WHERE a.Id = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

DELETE FROM membership.MemberApplicationRole WHERE ApplicationId = @Id;
DELETE FROM membership.ApplicationRole WHERE ApplicationRole = @Id;
DELETE FROM membership.ApplicationStage WHERE ApplicationId = @Id;
DELETE FROM membership.ApplicationService WHERE ApplicationId = @Id;
DELETE FROM membership.Application WHERE Id = @Id;

INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy)
VALUES ('application', CAST(@Id AS nvarchar(100)), 'deleted', @prev, NULL, @Actor);

COMMIT;
SELECT @Id AS [key] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
