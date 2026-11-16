@echo off
setlocal
cd /d "%~dp0..\.."
where node.exe >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 24 LTS with npm first.
 pause
 exit /b 1
)
node aikit\bridge\bootstrap.mjs --login
if errorlevel 1 goto failed
node aikit\bridge\setup-auth.mjs
if errorlevel 1 goto failed
echo Login saved locally.
pause
exit /b 0
:failed
echo Login setup blocked. Review the message above.
pause
exit /b 1
