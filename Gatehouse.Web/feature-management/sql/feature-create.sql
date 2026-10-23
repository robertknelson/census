-- Gatehouse's copy of FM2280's feature-create.sql (gatehouse.md §6, G-R10). Read by the command/query handlers, which choose the
-- result's shape from the text: this script's answer is a real FOR JSON, so it is read as one JSON document.
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

INSERT fm.FeatureAudit (FeatureId, Action, PreviousValue, NewValue, ChangedBy)
VALUES (@FeatureId, 'create', NULL, fm.FeatureSnapshot(@FeatureId), @Actor);

COMMIT;

SELECT JSON_QUERY(fm.FeatureSnapshot(@FeatureId)) AS feature FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
