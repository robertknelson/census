-- Grant (@Revoke = 0) or revoke (@Revoke = 1) one role to one member on one application, with its
-- audit row, in one transaction. The role must be in member-types. A grant that exists, or a revoke
-- of one that does not, is refused rather than silently ignored, so the page never shows a change
-- that did not happen. THROW 50404: member, application or role unknown; 50409: already so.

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM membership.Member WHERE Id = @MemberId)
    THROW 50404, 'That member no longer exists.', 1;
IF NOT EXISTS (SELECT 1 FROM membership.Application WHERE Id = @ApplicationId)
    THROW 50404, 'That application no longer exists.', 1;
IF NOT EXISTS (SELECT 1 FROM core.SelectItem x JOIN core.SelectItem h ON h.Id = x.MasterId AND h.MasterId = -1 AND h.Identifier = 'member-types' WHERE x.Id = @RoleId)
    THROW 50404, 'That role is not in member-types.', 1;

DECLARE @key nvarchar(100) = CONCAT(@MemberId, ':', @ApplicationId, ':', @RoleId);
DECLARE @row nvarchar(max) = (
    SELECT @MemberId AS MemberId, m.Identifier AS Member, @ApplicationId AS ApplicationId, a.Identifier AS Application,
           @RoleId AS RoleId, r.Identifier AS Role
    FROM membership.Member m, membership.Application a, core.SelectItem r
    WHERE m.Id = @MemberId AND a.Id = @ApplicationId AND r.Id = @RoleId
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
DECLARE @held bit = CASE WHEN EXISTS (SELECT 1 FROM membership.MemberApplicationRole
                                      WHERE MemberId = @MemberId AND ApplicationId = @ApplicationId AND RoleId = @RoleId) THEN 1 ELSE 0 END;

IF @Revoke = 0
BEGIN
    IF @held = 1 THROW 50409, 'That member already holds that role there.', 1;
    INSERT membership.MemberApplicationRole (MemberId, ApplicationId, RoleId) VALUES (@MemberId, @ApplicationId, @RoleId);
    INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy)
    VALUES ('grant', @key, 'granted', NULL, @row, @Actor);
END
ELSE
BEGIN
    IF @held = 0 THROW 50409, 'That member does not hold that role there.', 1;
    DELETE membership.MemberApplicationRole WHERE MemberId = @MemberId AND ApplicationId = @ApplicationId AND RoleId = @RoleId;
    INSERT membership.MembershipAudit (Entity, EntityKey, Action, PreviousValue, NewValue, ChangedBy)
    VALUES ('grant', @key, 'revoked', @row, NULL, @Actor);
END

COMMIT;
SELECT @key AS GrantKey;
