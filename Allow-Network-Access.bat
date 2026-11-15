@echo off
setlocal
rem Lets phones and other computers on your network reach HTML Lower Thirds.
rem Needs to be run ONCE by someone with administrator rights. Using the app on
rem this computer alone never needs this.
rem
rem Usage: double-click (uses port 3000), or:  Allow-Network-Access.bat 3001

set PORT=%~1
if "%PORT%"=="" set PORT=3000

net session >nul 2>&1
if errorlevel 1 (
  echo Asking Windows for administrator permission...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%PORT%' -Verb RunAs"
  exit /b
)

netsh advfirewall firewall delete rule name="HTML Lower Thirds" >nul 2>&1
netsh advfirewall firewall add rule name="HTML Lower Thirds" dir=in action=allow protocol=TCP localport=%PORT% profile=private,domain
if errorlevel 1 (
  echo.
  echo Couldn't add the firewall rule.
) else (
  echo.
  echo Done. Other devices on private and work networks can now reach port %PORT%.
  echo Public networks, like coffee-shop Wi-Fi, stay blocked.
)
echo.
pause
