@echo off
setlocal
cd /d "%~dp0..\.."
set "QA_START_MODE="
if not "%~2"=="" goto usage
if "%~1"=="" goto find_node
if /i "%~1"=="--check" set "QA_START_MODE=--check"
if /i "%~1"=="--once" set "QA_START_MODE=--once"
if not defined QA_START_MODE goto usage
:find_node
set "QA_NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "QA_NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined QA_NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "QA_NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined QA_NODE_EXE for /f "delims=" %%N in ('"%SystemRoot%\System32\where.exe" node.exe 2^>nul') do if not defined QA_NODE_EXE set "QA_NODE_EXE=%%N"
if not defined QA_NODE_EXE goto missing_node
"%QA_NODE_EXE%" "%~dp0start.mjs" %QA_START_MODE%
set "QA_EXIT_CODE=%errorlevel%"
if "%QA_EXIT_CODE%"=="0" echo Bridge startup or execution completed successfully.
if not "%QA_EXIT_CODE%"=="0" echo Local data is preserved. Resolve the specific message above, then restart.
if not defined QA_START_MODE pause
exit /b %QA_EXIT_CODE%
:missing_node
echo Startup blocked: Node.js was not found on PATH or in standard installation folders.
echo Install Node.js 24 with npm, then reopen this file. Git will be discovered automatically.
if not defined QA_START_MODE pause
exit /b 1
:usage
echo Usage: START-BRIDGE.cmd [--check ^| --once]
exit /b 1
