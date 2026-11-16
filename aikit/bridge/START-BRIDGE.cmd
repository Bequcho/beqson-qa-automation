@echo off
setlocal
cd /d "%~dp0..\.."
where node.exe >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 24 LTS with npm, then reopen this file.
 pause
 exit /b 1
)
node aikit\bridge\bootstrap.mjs
if errorlevel 1 goto failed
node aikit\bridge\watch.mjs
if errorlevel 1 goto failed
echo Bridge stopped.
pause
exit /b 0
:failed
echo Startup blocked. Review the message above; local data is preserved.
pause
exit /b 1
