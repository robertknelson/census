-- A manufactured month in the shared log tables, for the local demo log database only
-- (log-explorer-and-trace.md §9). No real rows: identifiers, applications, paths and bodies are
-- invented. Dated from the moment it runs, so today always has rows; run it again to move the month.
--
-- Six identifiers in four of the AppTrak demo's applications on DEV and PROD; sessions of page loads,
-- each with the API calls after it; writes with stored bodies; the anonymous 401 handshake before
-- each page; refusals, slow calls, errors in apptrak.Exception matched to their request by correlation,
-- messages, and one request at 11:10 PM to test the day boundary.

SET NOCOUNT ON;
SET XACT_ABORT ON;

DELETE FROM apptrak.ApiContent;
DELETE FROM apptrak.ApiRequest;
DELETE FROM apptrak.Exception;
DELETE FROM apptrak.Message;
DELETE FROM apptrak.Session;

DECLARE @people TABLE (n int IDENTITY(0,1), Identifier nvarchar(50), Roles nvarchar(50), Application nvarchar(50), Stage nvarchar(15), Browser nvarchar(75), Platform nvarchar(25));
INSERT @people (Identifier, Roles, Application, Stage, Browser, Platform) VALUES
    (N'aturner', N'underwriter', N'WidgetCore', N'PROD', N'Chrome 141', N'Windows'),
    (N'bkim', N'underwriter,manager', N'WidgetCore', N'PROD', N'Edge 141', N'Windows'),
    (N'cdiaz', N'agent', N'WidgetPortal', N'PROD', N'Chrome 141', N'macOS'),
    (N'dpatel', N'finance', N'LedgerService', N'PROD', N'Edge 141', N'Windows'),
    (N'eokafor', N'analyst', N'Reporting', N'PROD', N'Firefox 143', N'Windows'),
    (N'fnguyen', N'developer', N'WidgetCore', N'DEV', N'Chrome 141', N'Windows');

-- Each page with the controller and action the app records (usage.md §3: a page is its controller and action, so
-- /orders/detail/123 and /orders/detail/456 are one page). Weight makes some pages busier than others.
DECLARE @pages TABLE (n int IDENTITY(0,1), Path nvarchar(255), Area nvarchar(50), Action nvarchar(50), WithId bit, Weight int);
INSERT @pages (Path, Area, Action, WithId, Weight) VALUES
    (N'/', N'Home', N'Index', 0, 3), (N'/orders', N'Orders', N'Index', 0, 5), (N'/orders/detail/', N'Orders', N'Detail', 1, 6),
    (N'/quotes', N'Quotes', N'Index', 0, 3), (N'/quotes/detail/', N'Quotes', N'Detail', 1, 2),
    (N'/reports', N'Reports', N'Index', 0, 2), (N'/admin/settings', N'Settings', N'Index', 0, 1);
DECLARE @pageAction nvarchar(50), @withId bit, @fromPortal bit, @pick int, @weights int = (SELECT SUM(Weight) FROM @pages);

DECLARE @now datetimeoffset(7) = SYSDATETIMEOFFSET();
DECLARE @today date = CAST(@now AS date);
DECLARE @offset int = DATEPART(TZOFFSET, @now);
DECLARE @day int = 30, @p int, @s int, @sessions int, @pg int, @pagesN int, @c int, @calls int;
DECLARE @identifier nvarchar(50), @roles nvarchar(50), @app nvarchar(50), @stage nvarchar(15), @browser nvarchar(75), @platform nvarchar(25);
DECLARE @sid nvarchar(50), @at datetimeoffset(7), @path nvarchar(255), @area nvarchar(50), @machine nvarchar(25), @host nvarchar(50);
DECLARE @method nvarchar(6), @apiPath nvarchar(255), @action nvarchar(50), @status smallint, @elapsed int, @cid nvarchar(50), @uid nvarchar(36), @roll int, @id int;
DECLARE @agent nvarchar(255) = N'Mozilla/5.0 (demo)';

WHILE @day >= 0
BEGIN
    SET @p = 0;
    WHILE @p < 6
    BEGIN
        SELECT @identifier = Identifier, @roles = Roles, @app = Application, @stage = Stage, @browser = Browser, @platform = Platform FROM @people WHERE n = @p;
        SET @sessions = CASE
            WHEN @day = 0 THEN 1
            WHEN DATEPART(weekday, DATEADD(day, -@day, @today)) IN (1, 7) THEN CASE WHEN ABS(CHECKSUM(NEWID())) % 5 = 0 THEN 1 ELSE 0 END
            WHEN ABS(CHECKSUM(NEWID())) % 6 = 0 THEN 0
            ELSE 1 + ABS(CHECKSUM(NEWID())) % 3 END;
        SET @s = 0;
        WHILE @s < @sessions
        BEGIN
            SET @sid = REPLACE(CONVERT(nvarchar(36), NEWID()), N'-', N'');
            -- Office hours, but today's start before now so a morning run still has today.
            SET @at = TODATETIMEOFFSET(DATEADD(minute,
                CASE WHEN @day = 0 THEN ABS(CHECKSUM(NEWID())) % (DATEDIFF(minute, CAST(@today AS datetime2), CAST(@now AS datetime2)) - 30 + 1)
                     ELSE 8 * 60 + ABS(CHECKSUM(NEWID())) % (9 * 60) END,
                CAST(DATEADD(day, -@day, @today) AS datetime2(7))), @offset);
            SET @machine = CASE WHEN @stage = N'DEV' THEN N'WEBDEV01' WHEN ABS(CHECKSUM(NEWID())) % 2 = 0 THEN N'WEBPROD01' ELSE N'WEBPROD02' END;
            SET @host = LOWER(@app) + CASE WHEN @stage = N'DEV' THEN N'-dev' ELSE N'' END + N'.corp.example';
            -- A quarter of WidgetCore's sessions arrive from WidgetPortal's quotes page (usage.md U6).
            SET @fromPortal = CASE WHEN @app = N'WidgetCore' AND ABS(CHECKSUM(NEWID())) % 4 = 0 THEN 1 ELSE 0 END;
            IF @at < @now
                INSERT apptrak.Session (Uid, SessionId, CorrelationId, Machine, Stage, Application, StartAt, Identifier, Path, RefererPath, Referer, Platform, Browser, CreatedAt, IsFromApi)
                VALUES (NEWID(), @sid, REPLACE(CONVERT(nvarchar(36), NEWID()), N'-', N''), @machine, @stage, @app, @at, @identifier, N'/',
                    CASE WHEN @fromPortal = 1 THEN N'/quotes' ELSE N'' END,
                    CASE WHEN @fromPortal = 1 THEN N'https://widgetportal.corp.example/quotes' ELSE N'' END,
                    @platform, @browser, @at, 0);
            SET @pagesN = 2 + ABS(CHECKSUM(NEWID())) % 5;
            SET @pg = 0;
            WHILE @pg < @pagesN AND @at < @now
            BEGIN
                -- The first page of a session is home or the order list; after that, by weight.
                SET @pick = ABS(CHECKSUM(NEWID())) % @weights;
                IF @pg = 0
                    SELECT @path = Path, @area = Area, @pageAction = Action, @withId = WithId FROM @pages WHERE n = CASE WHEN @pick % 3 = 0 THEN 0 ELSE 1 END;
                ELSE
                    SELECT TOP (1) @path = Path, @area = Area, @pageAction = Action, @withId = WithId
                    FROM (SELECT p.*, SUM(Weight) OVER (ORDER BY n) AS Upto FROM @pages p) w
                    WHERE Upto > @pick
                    ORDER BY Upto;
                IF @withId = 1 SET @path = @path + CONVERT(nvarchar(10), 1000 + ABS(CHECKSUM(NEWID())) % 9000);

                -- The sign-in handshake, then the page itself.
                SET @cid = REPLACE(CONVERT(nvarchar(36), NEWID()), N'-', N'');
                INSERT apptrak.ApiRequest (Uid, SessionId, CorrelationId, Machine, Stage, Application, StartAt, StopAt, Elapsed, HasError, Identifier, Path, QueryString, HttpMethod, HttpStatus, ControllerName, ControllerMethod, Host, Scheme, UserAgent, Roles, Platform, Browser, IsPassThrough, HasContent, Data, CreatedAt, IsFromApi)
                VALUES (CONVERT(nvarchar(36), NEWID()), @sid, @cid, @machine, @stage, @app, @at, DATEADD(millisecond, 1, @at), 1, 0, N'', @path, N'', N'GET', 401, N'', N'', @host, N'https', @agent, N'', @platform, @browser, 0, 0, N'{}', @at, 0);
                SET @at = DATEADD(millisecond, 40, @at);
                SET @elapsed = 60 + ABS(CHECKSUM(NEWID())) % 400;
                SET @cid = REPLACE(CONVERT(nvarchar(36), NEWID()), N'-', N'');
                INSERT apptrak.ApiRequest (Uid, SessionId, CorrelationId, Machine, Stage, Application, StartAt, StopAt, Elapsed, HasError, Identifier, Path, QueryString, HttpMethod, HttpStatus, ControllerName, ControllerMethod, Host, Scheme, UserAgent, Roles, Platform, Browser, IsPassThrough, HasContent, Data, CreatedAt, IsFromApi)
                VALUES (CONVERT(nvarchar(36), NEWID()), @sid, @cid, @machine, @stage, @app, @at, DATEADD(millisecond, @elapsed, @at), @elapsed, 0, @identifier, @path, N'', N'GET', 200, @area, @pageAction, @host, N'https', @agent, @roles, @platform, @browser, 0, 0, N'{}', @at, 0);

                SET @calls = 1 + ABS(CHECKSUM(NEWID())) % 6;
                SET @c = 0;
                WHILE @c < @calls
                BEGIN
                    SET @at = DATEADD(second, 2 + ABS(CHECKSUM(NEWID())) % 90, @at);
                    SET @roll = ABS(CHECKSUM(NEWID())) % 100;
                    SET @id = 1000 + ABS(CHECKSUM(NEWID())) % 9000;
                    SELECT @method = m, @action = a, @apiPath = N'/api/' + LOWER(@area) + p FROM (VALUES
                        (0, N'GET', N'List', N'/list'), (1, N'GET', N'Get', N'/' + CONVERT(nvarchar(10), @id)), (2, N'GET', N'Lookups', N'/lookups'),
                        (3, N'POST', N'Save', N'/' + CONVERT(nvarchar(10), @id)), (4, N'PUT', N'Update', N'/' + CONVERT(nvarchar(10), @id)), (5, N'DELETE', N'Remove', N'/' + CONVERT(nvarchar(10), @id))
                    ) v(k, m, a, p) WHERE k = CASE WHEN @roll < 55 THEN @roll % 3 WHEN @roll < 85 THEN 3 WHEN @roll < 95 THEN 4 ELSE 5 END;
                    SET @status = CASE WHEN @roll % 33 = 7 THEN 500 WHEN @roll % 25 = 3 THEN 400 WHEN @roll % 40 = 11 THEN 403 WHEN @roll % 45 = 19 THEN 404 WHEN @roll % 50 = 23 THEN 409 ELSE 200 END;
                    SET @elapsed = CASE WHEN ABS(CHECKSUM(NEWID())) % 30 = 0 THEN 2000 + ABS(CHECKSUM(NEWID())) % 4000 ELSE 15 + ABS(CHECKSUM(NEWID())) % 600 END;
                    SET @cid = REPLACE(CONVERT(nvarchar(36), NEWID()), N'-', N'');
                    SET @uid = CONVERT(nvarchar(36), NEWID());
                    INSERT apptrak.ApiRequest (Uid, SessionId, CorrelationId, Machine, Stage, Application, StartAt, StopAt, Elapsed, HasError, Identifier, Path, QueryString, HttpMethod, HttpStatus, ControllerName, ControllerMethod, Host, Scheme, UserAgent, Roles, Platform, Browser, IsPassThrough, HasContent, Data, CreatedAt, IsFromApi)
                    VALUES (@uid, @sid, @cid, @machine, @stage, @app, @at, DATEADD(millisecond, @elapsed, @at), @elapsed, CASE WHEN @status = 500 THEN 1 ELSE 0 END, @identifier, @apiPath,
                        CASE WHEN @action = N'List' THEN N'?page=1&size=25' ELSE N'' END, @method, @status, @area, @action, @host, N'https', @agent, @roles, @platform, @browser, 0,
                        CASE WHEN @method IN (N'POST', N'PUT') THEN 1 ELSE 0 END, N'{}', @at, 0);
                    IF @method IN (N'POST', N'PUT')
                        INSERT apptrak.ApiContent (Uid, ContentType, Content, CreatedAt, IsFromApi)
                        VALUES (@uid, 0, CONCAT(N'{"id":', @id, N',"status":"', CASE @roll % 3 WHEN 0 THEN N'open' WHEN 1 THEN N'pending' ELSE N'closed' END,
                            N'","amount":', 100 + @roll * 7, N'.50,"note":"demo"}'), @at, 0);
                    IF @status = 500
                        INSERT apptrak.Exception (Uid, SessionId, Machine, Stage, Application, Path, StartAt, Level, Message, ActionName, SourceContext, Tags, Data, CreatedAt, IsFromApi, CorrelationId)
                        VALUES (CONVERT(nvarchar(36), NEWID()), @sid, @machine, @stage, @app, @apiPath, DATEADD(millisecond, @elapsed - 5, @at), N'Error',
                            CASE @roll % 3 WHEN 0 THEN N'Object reference not set to an instance of an object.' WHEN 1 THEN N'Execution Timeout Expired.' ELSE N'Violation of UNIQUE KEY constraint.' END,
                            @area + N'Controller.' + @action, @app + N'.' + @area + N'Service', N'api', N'{"stack":"at ' + @app + N'.' + @area + N'Service.' + @action + N'()"}', @at, 0, @cid);
                    IF @method IN (N'POST', N'PUT', N'DELETE') OR @status <> 200
                        INSERT apptrak.Message (Uid, SessionId, CorrelationId, Machine, Stage, Application, StartAt, Path, Level, Message, ActionName, SourceContext, Tags, Data, CreatedAt, IsFromApi)
                        VALUES (CONVERT(nvarchar(36), NEWID()), @sid, @cid, @machine, @stage, @app, DATEADD(millisecond, 3, @at), @apiPath,
                            CASE WHEN @status = 200 THEN N'Information' WHEN @status = 500 THEN N'Error' ELSE N'Warning' END,
                            CASE WHEN @status = 200 THEN @action + N' ' + LOWER(@area) + N' ' + CONVERT(nvarchar(10), @id)
                                 WHEN @status = 500 THEN N'Request failed' ELSE N'Refused: ' + CONVERT(nvarchar(5), @status) END,
                            @area + N'Controller.' + @action, @app + N'.' + @area + N'Controller', N'', N'{}', @at, 0);
                    SET @c += 1;
                END
                SET @at = DATEADD(second, 20 + ABS(CHECKSUM(NEWID())) % (CASE WHEN ABS(CHECKSUM(NEWID())) % 6 = 0 THEN 1500 ELSE 240 END), @at);
                SET @pg += 1;
            END
            SET @s += 1;
        END
        SET @p += 1;
    END
    SET @day -= 1;
END

-- Writes after the moment the seed ran would be from the future: today's sessions stop at now.
DELETE FROM apptrak.ApiRequest WHERE StartAt > @now;
DELETE FROM apptrak.Message WHERE StartAt > @now;
DELETE FROM apptrak.Exception WHERE StartAt > @now;
DELETE c FROM apptrak.ApiContent c WHERE NOT EXISTS (SELECT 1 FROM apptrak.ApiRequest r WHERE r.Uid = c.Uid);

-- The day boundary: one request at 11:10 PM yesterday, on yesterday in the browser's day.
INSERT apptrak.ApiRequest (Uid, SessionId, CorrelationId, Machine, Stage, Application, StartAt, StopAt, Elapsed, HasError, Identifier, Path, QueryString, HttpMethod, HttpStatus, ControllerName, ControllerMethod, Host, Scheme, UserAgent, Roles, Platform, Browser, IsPassThrough, HasContent, Data, CreatedAt, IsFromApi)
VALUES (CONVERT(nvarchar(36), NEWID()), N'late-night-session', N'late-night-request', N'WEBPROD01', N'PROD', N'LedgerService',
    TODATETIMEOFFSET(DATEADD(minute, 23 * 60 + 10, CAST(DATEADD(day, -1, @today) AS datetime2(7))), @offset),
    TODATETIMEOFFSET(DATEADD(minute, 23 * 60 + 10, CAST(DATEADD(day, -1, @today) AS datetime2(7))), @offset),
    120, 0, N'dpatel', N'/api/ledger/close', N'', N'POST', 200, N'Ledger', N'Close', N'ledgerservice.corp.example', N'https', @agent, N'finance', N'Windows', N'Edge 141', 0, 0, N'{}', @now, 0);

SELECT 'apptrak.ApiRequest' AS [table], COUNT(*) AS [rows] FROM apptrak.ApiRequest
UNION ALL SELECT 'apptrak.ApiContent', COUNT(*) FROM apptrak.ApiContent
UNION ALL SELECT 'apptrak.Exception', COUNT(*) FROM apptrak.Exception
UNION ALL SELECT 'apptrak.Message', COUNT(*) FROM apptrak.Message
UNION ALL SELECT 'apptrak.Session', COUNT(*) FROM apptrak.Session;
