@echo off
setlocal
cd /d "%~dp0..\.."
where node.exe >nul 2>nul
if errorlevel 1 (
 echo Node.js is missing. Install Node.js 24 and try again.
 pause
 exit /b 1
)
where gh.exe >nul 2>nul
if errorlevel 1 (
 echo GitHub CLI is missing. Run: winget install --id GitHub.cli
 echo Then reopen this window and run START-BRIDGE.cmd again.
 pause
 exit /b 1
)
if not exist "node_modules\@playwright\test\package.json" (
 echo Installing locally locked Playwright dependencies...
 call npm ci
 if errorlevel 1 goto failed
)
echo Checking Chromium...
call npx playwright install chromium
if errorlevel 1 goto failed
call gh auth status >nul 2>nul
if errorlevel 1 (
 echo Please sign in to GitHub as Bequcho:
 call gh auth login --hostname github.com --scopes repo
 if errorlevel 1 goto failed
)
echo.
echo Starting aiKit QA Bridge (PRIVATE GitHub queue).
echo Leave this window open. Ctrl+C stops the bridge.
node aikit\bridge\watch.mjs
echo.
echo Bridge exited.
pause
exit /b 0
:failed
echo Setup failed. Review the error and try again.
pause
exit /b 1
