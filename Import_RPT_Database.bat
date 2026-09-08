@echo off
REM ============================================================
REM  Import rpt_data_IMPORT.db as the live RPT database.
REM  Stops the server, backs up current data, swaps in the new
REM  data as a WRITABLE file, then restarts the server.
REM  Asks for administrator permission automatically.
REM ============================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator permission...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"
title Import RPT Database
set "DBDIR=%~dp0data"
set "IMPORT=%DBDIR%\rpt_data_IMPORT.db"
set "LIVE=%DBDIR%\rpt_data.db"

if not exist "%IMPORT%" (
  echo ERROR: %IMPORT% not found. Nothing to import.
  pause
  exit /b 1
)

echo.
echo [1] Stopping the RPT server...
schtasks /End /TN "RPTServer" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'start-rpt-hidden' -or ($_.CommandLine -match 'run-server-LOCAL' -and $_.CommandLine -match 'Real Property') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4000" ^| findstr /I "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
timeout /t 3 /nobreak >nul

echo [2] Backing up current data...
if exist "%LIVE%" (
  attrib -r "%LIVE%" 2>nul
  powershell -NoProfile -Command "Copy-Item '%LIVE%' ('%LIVE%.beforeimport_' + (Get-Date -Format 'yyyyMMdd_HHmmss')) -Force" 2>nul
)

echo [3] Removing old database + journal files...
attrib -r "%LIVE%" 2>nul
del /f /q "%LIVE%" "%LIVE%-journal" "%LIVE%-wal" "%LIVE%-shm" >nul 2>&1

echo [4] Swapping in the new data (as a writable file)...
copy /y "%IMPORT%" "%LIVE%" >nul
attrib -r "%LIVE%" 2>nul
del /f /q "%IMPORT%" >nul 2>&1
echo     Done.

echo [5] Restarting the server...
schtasks /Run /TN "RPTServer" >nul 2>&1
echo     Waiting for it to come up...
timeout /t 6 /nobreak >nul
powershell -NoProfile -Command "try { $r = Invoke-RestMethod 'http://localhost:4000/api/health' -TimeoutSec 5; 'HEALTH OK -> ' + ($r | ConvertTo-Json -Compress) } catch { 'Not responding yet - wait a few seconds and open http://localhost:4000' }"

echo.
echo ============================================================
echo   Import complete. Open http://localhost:4000
echo   (or http://10.1.1.16:4000 from a client).
echo   Previous data saved as data\rpt_data.db.beforeimport_...
echo ============================================================
echo.
pause
