-- One unit of work (gatehouse.md §12.6): every event that carries its WorkUid, in the order they happened (StartAt,
-- never Id: events arrive late and out of order, D10), with when each arrived. The business payload is returned as the
-- text it was logged as: the handler camel-cases a JSON answer's keys, and a payload's keys are the sender's. On the logs database; @Schema is
-- Logs:Schema, built into the statement, every value a parameter. Index: IX_AppEvent_WorkUid.

SET NOCOUNT ON;

IF OBJECT_ID(QUOTENAME(@Schema) + N'.[AppEvent]') IS NULL THROW 50404, N'The AppEvent table is not in this database under that schema (Logs:Schema).', 1;

DECLARE @q nvarchar(max) = REPLACE(N'
SELECT (
    SELECT TOP (500) e.Id AS id, e.Uid AS uid, e.ParentUid AS parentUid, e.WorkUid AS workUid, e.Application AS application, e.Stage AS stage,
           e.Machine AS machine, e.Identifier AS identifier, e.StartAt AS startAt, e.CreatedAt AS createdAt, e.Namespace AS namespace,
           e.CommandName AS commandName, e.CommandActivity AS activity, e.Message AS message, e.SubjectType AS subjectType,
           e.SubjectKey AS subjectKey, e.Path AS path, e.IsFromApi AS isFromApi,
           e.Body AS body
    FROM {s}.AppEvent e
    WHERE e.WorkUid = @WorkUid
    ORDER BY e.StartAt, e.Id
    FOR JSON PATH, INCLUDE_NULL_VALUES
) AS JsonNode;', N'{s}', QUOTENAME(@Schema));

EXEC sp_executesql @q, N'@WorkUid nvarchar(36)', @WorkUid = @WorkUid;
