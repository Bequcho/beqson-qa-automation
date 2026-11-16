@echo off
setlocal
cd /d "%~dp0..\.."
where node.exe >nul 2>nul
if errorlevel 1 (
 echo Node.js 24 is required.
 pause
 exit /b 1
)
if not exist "node_modules\@playwright\test\package.json" (
 call npm ci
 if errorlevel 1 goto fail
)
call npx playwright install chromium
if errorlevel 1 goto fail
echo Sign in to aiKit manually in the browser that opens.
node aikit\bridge\setup-auth.mjs
if errorlevel 1 goto fail
echo aiKit local QA profile configured.
pause
exit /b 0
:fail
echo Setup failed.
pause
exit /b 1
