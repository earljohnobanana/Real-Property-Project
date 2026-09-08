@echo off
REM ============================================================
REM  Make the RPT server ALWAYS-ON (port 4000):
REM    - opens the firewall port
REM    - runs hidden in the background (no window)
REM    - starts automatically at logon
REM  Run this ONCE on the SERVER laptop.
REM  Asks for administrator permission automatically.
REM ============================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator permission...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"
title Install RPT Server Auto-Start

echo.
echo [1/4] Opening firewall port 4000...
netsh advfirewall firewall delete rule name="RPT Management 4000" >nul 2>&1
netsh advfirewall firewall add rule name="RPT Management 4000" dir=in action=allow protocol=TCP localport=4000 >nul

echo [2/4] Stopping any server already running...
schtasks /End /TN "RPTServer" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'run-server-LOCAL' -and $_.CommandLine -match 'Real Property' -or $_.CommandLine -match 'start-rpt-hidden' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4000" ^| findstr /I "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
timeout /t 2 /nobreak >nul

echo [3/4] Registering auto-start at logon (hidden background)...
schtasks /Create /TN "RPTServer" /TR "wscript.exe \"%~dp0start-rpt-hidden.vbs\"" /SC ONLOGON /F

echo [4/4] Starting the server now...
schtasks /Run /TN "RPTServer"
echo     Waiting for it to come up...
timeout /t 6 /nobreak >nul
powershell -NoProfile -Command "try { $r = Invoke-RestMethod 'http://localhost:4000/api/health' -TimeoutSec 5; 'HEALTH OK -> ' + ($r | ConvertTo-Json -Compress) } catch { 'Not responding yet - give it a few seconds, then open http://localhost:4000' }"

echo.
echo ============================================================
echo   Done. RPT runs in the background and starts at logon.
echo     On this PC:  http://localhost:4000
echo     Clients:     http://10.1.1.16:4000
echo ============================================================
echo.
pause
