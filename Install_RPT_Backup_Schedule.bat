@echo off
REM ============================================================
REM  Schedule an automatic WEEKLY backup of the RPT database.
REM  Default: every Friday 4:30 PM (server can stay running).
REM  Make sure the laptop's time zone is Philippine Time (UTC+8).
REM  Asks for administrator permission automatically.
REM ============================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator permission...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"
set "BACKUP_TIME=16:30"
set "BACKUP_DAY=FRI"

echo.
echo Scheduling a WEEKLY RPT database backup every %BACKUP_DAY% at %BACKUP_TIME%...
schtasks /Create /TN "RPTBackup" ^
  /TR "wscript.exe \"%~dp0run-backup-hidden.vbs\"" ^
  /SC WEEKLY /D %BACKUP_DAY% /ST %BACKUP_TIME% /F

echo.
echo Running one backup now to confirm it works...
schtasks /Run /TN "RPTBackup"
timeout /t 5 /nobreak >nul

echo.
echo ============================================================
echo   Done. A backup runs every %BACKUP_DAY% at %BACKUP_TIME%.
echo   Snapshots are saved in the "backups" folder (newest 30 kept).
echo   For USB copies: make a folder named "RPTBackups" at the
echo   root of the USB stick.
echo ============================================================
echo.
if exist "%~dp0backups\backup.log" powershell -NoProfile -Command "Get-Content '%~dp0backups\backup.log' -Tail 4"
echo.
pause
