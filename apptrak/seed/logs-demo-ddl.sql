-- The shared log tables, for the local demo log database only (log-explorer-and-trace.md §9).
-- The shape of xf-dashboard's DDL (sqlscripts/ddl/all.sql, 2026-04-12) with
-- log.Exception.CorrelationId, which the target has (T1). The real environment already has these
-- tables (R1): this file never runs there.

SET NOCOUNT ON;

IF SCHEMA_ID(N'log') IS NULL EXEC (N'CREATE SCHEMA [log]');

IF OBJECT_ID(N'log.ApiContent') IS NULL
CREATE TABLE log.ApiContent (
    Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ApiContent PRIMARY KEY,
    Uid nvarchar(36) NOT NULL,
    ContentType tinyint NOT NULL,
    Content nvarchar(max) NOT NULL,
    CreatedAt datetimeoffset(7) NOT NULL,
    IsFromApi bit NOT NULL);

IF OBJECT_ID(N'log.ApiRequest') IS NULL
CREATE TABLE log.ApiRequest (
    Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ApiRequest PRIMARY KEY,
    Uid nvarchar(36) NOT NULL,
    SessionId nvarchar(50) NOT NULL,
    CorrelationId nvarchar(50) NOT NULL,
    Machine nvarchar(25) NOT NULL,
    Stage nvarchar(15) NOT NULL,
    Application nvarchar(50) NOT NULL,
    StartAt datetimeoffset(7) NOT NULL,
    StopAt datetimeoffset(7) NOT NULL,
    Elapsed int NOT NULL,
    HasError bit NOT NULL,
    Identifier nvarchar(50) NOT NULL,
    Path nvarchar(255) NOT NULL,
    QueryString nvarchar(255) NOT NULL,
    HttpMethod nvarchar(6) NOT NULL,
    HttpStatus smallint NOT NULL,
    ControllerName nvarchar(50) NOT NULL,
    ControllerMethod nvarchar(50) NOT NULL,
    Host nvarchar(50) NOT NULL,
    Scheme nvarchar(6) NOT NULL,
    UserAgent nvarchar(255) NOT NULL,
    Roles nvarchar(50) NOT NULL,
    Platform nvarchar(25) NOT NULL,
    Browser nvarchar(75) NOT NULL,
    IsPassThrough bit NOT NULL,
    HasContent bit NOT NULL,
    Data nvarchar(max) NOT NULL,
    CreatedAt datetimeoffset(7) NOT NULL,
    IsFromApi bit NOT NULL,
    ExecuteOn AS (CONVERT(date, StartAt)) PERSISTED,
    Executeat AS (CONVERT(date, StartAt)) PERSISTED);

IF OBJECT_ID(N'log.Exception') IS NULL
CREATE TABLE log.Exception (
    Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Exception PRIMARY KEY,
    Uid nvarchar(36) NOT NULL,
    SessionId nvarchar(50) NOT NULL,
    Machine nvarchar(25) NOT NULL,
    Stage nvarchar(15) NOT NULL,
    Application nvarchar(50) NOT NULL,
    Path nvarchar(255) NULL,
    StartAt datetimeoffset(7) NOT NULL,
    Level nvarchar(15) NOT NULL,
    Message nvarchar(255) NOT NULL,
    ActionName nvarchar(255) NULL,
    SourceContext nvarchar(255) NULL,
    Tags nvarchar(50) NOT NULL,
    Data nvarchar(max) NOT NULL,
    CreatedAt datetimeoffset(7) NOT NULL,
    IsFromApi bit NOT NULL,
    CorrelationId nvarchar(100) NULL,
    ExecuteOn AS (CONVERT(date, StartAt)) PERSISTED,
    ExecuteAt AS (CONVERT(time(0), StartAt)) PERSISTED);

IF OBJECT_ID(N'log.Message') IS NULL
CREATE TABLE log.Message (
    Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Message PRIMARY KEY,
    Uid nvarchar(36) NOT NULL,
    SessionId nvarchar(50) NOT NULL,
    CorrelationId nvarchar(50) NOT NULL,
    Machine nvarchar(25) NOT NULL,
    Stage nvarchar(15) NOT NULL,
    Application nvarchar(50) NOT NULL,
    StartAt datetimeoffset(7) NOT NULL,
    Path nvarchar(255) NULL,
    Level nvarchar(15) NOT NULL,
    Message nvarchar(255) NOT NULL,
    ActionName nvarchar(255) NULL,
    SourceContext nvarchar(255) NULL,
    Tags nvarchar(50) NOT NULL,
    Data nvarchar(max) NOT NULL,
    CreatedAt datetimeoffset(7) NOT NULL,
    IsFromApi bit NOT NULL,
    ExecuteOn AS (CONVERT(date, StartAt)) PERSISTED,
    ExecuteAt AS (CONVERT(time(0), StartAt)) PERSISTED);

IF OBJECT_ID(N'log.Session') IS NULL
CREATE TABLE log.Session (
    Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Session PRIMARY KEY,
    Uid uniqueidentifier NOT NULL,
    SessionId nvarchar(50) NOT NULL,
    CorrelationId nvarchar(50) NOT NULL,
    Machine nvarchar(25) NOT NULL,
    Stage nvarchar(15) NOT NULL,
    Application nvarchar(50) NOT NULL,
    StartAt datetimeoffset(7) NOT NULL,
    Identifier nvarchar(50) NOT NULL,
    Path nvarchar(255) NOT NULL,
    RefererPath nvarchar(255) NOT NULL,
    Referer nvarchar(255) NOT NULL,
    Platform nvarchar(25) NOT NULL,
    Browser nvarchar(75) NOT NULL,
    CreatedAt datetimeoffset(7) NOT NULL,
    IsFromApi bit NOT NULL,
    ExecuteOn AS (CONVERT(date, StartAt)) PERSISTED,
    ExecuteAt AS (CONVERT(time(0), StartAt)) PERSISTED);
