-- Whether this database is armed for the reset: the extended property 002-arm-reset.sql sets by hand.
SET NOCOUNT ON;
SELECT CAST(CASE WHEN EXISTS (SELECT 1 FROM sys.extended_properties
                              WHERE class = 0 AND name = N'AllowAssertionReset' AND CAST(value AS nvarchar(10)) = N'1')
            THEN 1 ELSE 0 END AS bit) AS Armed;
