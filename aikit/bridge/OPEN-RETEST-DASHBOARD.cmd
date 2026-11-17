@echo off
setlocal
cd /d "%~dp0..\.."
if not defined AIKIT_LOCAL_DIR if exist "%CD%\.aikit-local\interactive-source.json" set "AIKIT_LOCAL_DIR=%CD%\.aikit-local"
if not defined AIKIT_LOCAL_DIR set "AIKIT_LOCAL_DIR=%CD%\.aikit-local\interactive-worker\.aikit-local"
if not exist "%AIKIT_LOCAL_DIR%\retests\dashboard.html" (
 echo No local retest dashboard exists yet. Queue DISCOVER_RETESTS or RETEST_ALL_LIVE first.
 pause
 exit /b 1
)
start "" "%AIKIT_LOCAL_DIR%\retests\dashboard.html"
