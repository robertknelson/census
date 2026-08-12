@echo off
rem Start Census Web. This is the project's `ignite` command (.trail-boss/dispatch.md):
rem Trail Boss runs it blind from the repo root in cmd.exe, so keep it cmd syntax.
rem
rem   start-census.bat          the demo fleet (default)
rem   start-census.bat real     the real output\ tree and config\machines.json
rem
rem Demo is the default deliberately: this repo's real output\ tree holds one stale
rem unreachable entry, so the real profile renders an empty estate and a board click
rem would look broken. The demo tree always has a fleet to draw.

setlocal
if /i "%~1"=="real" (
    set "ASPNETCORE_ENVIRONMENT=Production"
    echo Starting Census Web against the REAL census tree ^(output\^).
) else (
    set "ASPNETCORE_ENVIRONMENT=Demo"
    echo Starting Census Web against the DEMO fleet ^(output-demo\^).  Use "start-census.bat real" for the real tree.
)

set "ASPNETCORE_URLS=http://localhost:5199"
echo.
echo     http://localhost:5199
echo.
echo Ctrl+C to stop.
echo.

cd /d "%~dp0Census.Web" || exit /b 1
dotnet run --no-launch-profile
endlocal
