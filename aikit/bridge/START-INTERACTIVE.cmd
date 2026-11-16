@echo off
setlocal
cd /d "%~dp0..\.."
if not defined AIKIT_LOCAL_DIR if exist "%CD%\.aikit-local\interactive-source.json" set "AIKIT_LOCAL_DIR=%CD%\.aikit-local"
if not defined AIKIT_LOCAL_DIR set "AIKIT_LOCAL_DIR=%CD%\.aikit-local\interactive-worker\.aikit-local"
set "AIKIT_BRIDGE_LANE=browser"
set "QA_NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist "%QA_NODE_EXE%" set "QA_NODE_EXE="
if not defined QA_NODE_EXE for /f "delims=" %%N in ('"%SystemRoot%\System32\where.exe" node.exe 2^>nul') do if not defined QA_NODE_EXE set "QA_NODE_EXE=%%N"
if not defined QA_NODE_EXE (
 echo Node.js 24 is required. Existing QA data was not changed.
 pause
 exit /b 1
)
"%QA_NODE_EXE%" "%~dp0setup-interactive.mjs"
if errorlevel 1 (
 echo Interactive setup blocked. Review the specific local message above.
 pause
 exit /b 1
)
call "%~dp0START-BRIDGE.cmd"
exit /b %errorlevel%
