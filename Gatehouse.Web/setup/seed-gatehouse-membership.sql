-- Gatehouse in the local AppTrak's membership (gatehouse.md §8): the application, and the person running it as a
-- member with roles on it. LOCAL ONLY: the identifier and roles arrive as sqlcmd variables from
-- Invoke-GatehouseDemo.ps1 (your Windows username), so no account name is written in the repo.
-- Idempotent: the application is added once; the member's roles on Gatehouse are replaced with the ones asked for.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @identifier nvarchar(100) = N'$(Identifier)';
DECLARE @roles nvarchar(max) = N'$(Roles)';   -- comma-separated member-types identifiers

DECLARE @website int = (SELECT x.Id FROM core.SelectItem x JOIN core.SelectItem h ON h.Id = x.MasterId
                        WHERE h.Identifier = 'application-types' AND x.Identifier = 'website');

IF NOT EXISTS (SELECT 1 FROM membership.Application WHERE Identifier = 'gatehouse')
    INSERT membership.Application (Identifier, Name, Tags, Disposition, ApplicationTypeId)
    VALUES ('gatehouse', 'Gatehouse', 'gatehouse-demo', 'current', @website);
DECLARE @application int = (SELECT Id FROM membership.Application WHERE Identifier = 'gatehouse');

IF NOT EXISTS (SELECT 1 FROM membership.Member WHERE Identifier = @identifier)
    INSERT membership.Member (Identifier, WindowsIdentity, FirstName, LastName, Email, CreatedAt)
    VALUES (@identifier, @identifier, @identifier, N'(local)', N'', SYSDATETIMEOFFSET());
DECLARE @member int = (SELECT Id FROM membership.Member WHERE Identifier = @identifier);

DELETE FROM membership.MemberApplicationRole WHERE MemberId = @member AND ApplicationId = @application;
INSERT membership.MemberApplicationRole (MemberId, ApplicationId, RoleId)
SELECT @member, @application, r.Id
FROM STRING_SPLIT(@roles, ',') s
JOIN core.SelectItem r ON r.Identifier = TRIM(s.value)
JOIN core.SelectItem h ON h.Id = r.MasterId AND h.MasterId = -1 AND h.Identifier = 'member-types';

COMMIT;

SELECT m.Identifier, a.Identifier AS Application, r.Identifier AS Role
FROM membership.MemberApplicationRole g
JOIN membership.Member m ON m.Id = g.MemberId
JOIN membership.Application a ON a.Id = g.ApplicationId
JOIN core.SelectItem r ON r.Id = g.RoleId
WHERE g.MemberId = @member AND g.ApplicationId = @application;
