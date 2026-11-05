-- Arms the reset on THIS database (census-on-apptrak.md §5): the second key, beside the app's
-- Reset:Allowed setting. Run by hand, once, on a database that is not production. Never in a deploy.
--   sqlcmd -S localhost -E -d AppTrak -i apptrak\sql\reset\002-arm-reset.sql
-- To disarm: EXEC sys.sp_dropextendedproperty @name = N'AllowAssertionReset';

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE class = 0 AND name = N'AllowAssertionReset')
    EXEC sys.sp_addextendedproperty @name = N'AllowAssertionReset', @value = N'1';
