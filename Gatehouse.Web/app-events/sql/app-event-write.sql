-- Write one AppEvent (gatehouse.md §12.4), as the live Serilog sink does once fixed: the event's own Uid and StartAt
-- (when it happened, at the sender), AppTrak's CreatedAt (when it arrived), the five new columns. A Uid already stored is
-- a duplicate and is skipped (D10). On the logs database; @Schema is Logs:Schema, built into the statement, every value
-- a parameter. Returns whether it was written.

SET NOCOUNT ON;

IF OBJECT_ID(QUOTENAME(@Schema) + N'.[AppEvent]') IS NULL THROW 50404, N'The AppEvent table is not in this database under that schema (Logs:Schema).', 1;

DECLARE @q nvarchar(max) = REPLACE(N'
IF EXISTS (SELECT 1 FROM {s}.AppEvent WHERE Uid = @Uid)
    SELECT 0 AS [written];
ELSE
BEGIN
    INSERT {s}.AppEvent (Uid, Identifier, Path, SessionId, CorrelationId, Machine, Stage, Application, StartAt, Namespace, CommandName,
                         CommandActivity, Body, Data, IsFromApi, WorkUid, ParentUid, SubjectType, SubjectKey, Message)
    VALUES (@Uid, @Identifier, @Path, @SessionId, @CorrelationId, @Machine, @Stage, @Application, @StartAt, @Namespace, @CommandName,
            @CommandActivity, @Body, @Data, 0, @WorkUid, @ParentUid, @SubjectType, @SubjectKey, @Message);
    SELECT 1 AS [written];
END', N'{s}', QUOTENAME(@Schema));

DECLARE @result TABLE (written bit);
INSERT @result
EXEC sp_executesql @q,
    N'@Uid nvarchar(36), @Identifier nvarchar(50), @Path nvarchar(255), @SessionId nvarchar(50), @CorrelationId nvarchar(50),
      @Machine nvarchar(25), @Stage nvarchar(15), @Application nvarchar(50), @StartAt datetimeoffset, @Namespace nvarchar(50),
      @CommandName nvarchar(50), @CommandActivity nvarchar(50), @Body nvarchar(max), @Data nvarchar(max), @WorkUid nvarchar(36),
      @ParentUid nvarchar(36), @SubjectType nvarchar(50), @SubjectKey nvarchar(100), @Message nvarchar(500)',
    @Uid = @Uid, @Identifier = @Identifier, @Path = @Path, @SessionId = @SessionId, @CorrelationId = @CorrelationId,
    @Machine = @Machine, @Stage = @Stage, @Application = @Application, @StartAt = @StartAt, @Namespace = @Namespace,
    @CommandName = @CommandName, @CommandActivity = @CommandActivity, @Body = @Body, @Data = @Data, @WorkUid = @WorkUid,
    @ParentUid = @ParentUid, @SubjectType = @SubjectType, @SubjectKey = @SubjectKey, @Message = @Message;

SELECT written FROM @result FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
