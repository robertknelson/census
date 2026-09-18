-- SQL Agent job: run backfill-deployment.sql once a day so moveit.Deployment keeps up with
-- HealthReport until the live processor (morning guide Part E) writes rows itself. After
-- that, the same job is the two-producer audit: it must report 0 inserted every morning.
--
-- One step, CmdExec, running sqlcmd over the backfill FILE - the rule stays in one place.
-- So: the file must be readable from the SQL Server box by the Agent service account, and
-- the job owner must be sysadmin (CmdExec without a proxy). Override the path and hour:
--
--   sqlcmd -S REALSERVER -d AppTrak -E -I -b -i sql\004-create-backfill-job.sql
--          -v ScriptPath="D:\apptrak\backfill-deployment.sql" RunAt=063000
--
-- Idempotent: drops and recreates the job. Run it again to change the path or the time.

:setvar ScriptPath "C:\github\ai\census\apptrak\sql\backfill-deployment.sql"
:setvar RunAt 060000

SET NOCOUNT ON;

DECLARE @job     sysname = N'Move It - backfill deployment ledger';
DECLARE @db      sysname = DB_NAME();
DECLARE @server  sysname = @@SERVERNAME;
DECLARE @owner   sysname = SUSER_SNAME();
DECLARE @command nvarchar(max) =
    N'sqlcmd -S "' + @server + N'" -d "' + @db + N'" -E -I -b -i "$(ScriptPath)"';

IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = @job)
    EXEC msdb.dbo.sp_delete_job @job_name = @job, @delete_unused_schedule = 1;

EXEC msdb.dbo.sp_add_job
    @job_name         = @job,
    @owner_login_name = @owner,
    @description      = N'Applies the moveit.Deployment rule (backfill-deployment.sql) over new HealthReport rows. Idempotent; the printed "N inserted" is the day''s count.';

EXEC msdb.dbo.sp_add_jobstep
    @job_name        = @job,
    @step_name       = N'backfill-deployment.sql',
    @subsystem       = N'CmdExec',
    @command         = @command,
    @on_success_action = 1,   -- quit reporting success
    @on_fail_action    = 2;   -- quit reporting failure

EXEC msdb.dbo.sp_add_jobschedule
    @job_name          = @job,
    @name              = N'Daily',
    @freq_type         = 4,   -- daily
    @freq_interval     = 1,
    @active_start_time = $(RunAt);

EXEC msdb.dbo.sp_add_jobserver @job_name = @job, @server_name = N'(local)';

PRINT CONCAT('Job "', @job, '" runs daily at $(RunAt) on ', @server, ' as ', @owner, ': ', @command);
