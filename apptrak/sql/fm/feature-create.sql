SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRAN;

IF EXISTS (SELECT 1 FROM fm.Feature WITH (UPDLOCK, HOLDLOCK) WHERE Name = @Name AND IsVoided = 0)
    THROW 50409, 'A feature with this name already exists.', 1;

INSERT fm.Feature (Name, DisplayName, Description, IsEnabled, CreatedBy)
VALUES (@Name, @DisplayName, @Description, @IsEnabled, @Actor);

DECLARE @FeatureId int = SCOPE_IDENTITY();

INSERT fm.FeatureRole (FeatureId, RoleName, GrantedBy)
SELECT DISTINCT @FeatureId, CONVERT(varchar(100), r.[value]), @Actor
FROM OPENJSON(@Roles) r;

INSERT fm.FeatureAudit (FeatureId, Action, PreviousValue, NewValue, ChangedBy, ImpersonatedBy)
VALUES (@FeatureId, 'create', NULL, fm.FeatureSnapshot(@FeatureId), @Actor, @ImpersonatedBy);

COMMIT;

SELECT fm.FeatureSnapshot(@FeatureId);
