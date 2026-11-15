@echo off
setlocal
rem Builds dist\HTML-Lower-Thirds.exe on this computer (the same way the GitHub release does).
rem Needs Node.js 22 or newer and an internet connection (downloads the "postject" tool once).
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODEMAJOR=%%v
if %NODEMAJOR% LSS 22 (
  echo This needs Node.js 22 or newer. You have:
  node -v
  echo Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

echo Building HTML Lower Thirds...
echo.
node scripts\build.mjs
if errorlevel 1 (
  echo.
  echo The build failed. See the messages above.
  pause
  exit /b 1
)
echo.
echo Done: %~dp0dist\HTML-Lower-Thirds.exe
echo Close any running HTML Lower Thirds window before starting the new one.
start "" "%~dp0dist"
pause
