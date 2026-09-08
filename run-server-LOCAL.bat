@echo off
REM ============================================================
REM  Real Property Tax (RPT) web server on THIS laptop.
REM  Serves the app on port 4000 so clients can open
REM  http://10.1.1.16:4000
REM  Uses the project's own data folder: data\rpt_data.db
REM ============================================================
title RPT Management Server (port 4000)
cd /d "%~dp0"

set "NODE=node"
where node >nul 2>&1 || set "NODE=C:\Program Files\nodejs\node.exe"

REM Data folder (database + daily auto-backups live here)
set "RPT_DATA_DIR=%~dp0data"
set "PORT=4000"

if not exist "%RPT_DATA_DIR%"  mkdir "%RPT_DATA_DIR%"
if not exist "%~dp0logs"       mkdir "%~dp0logs"
set "LOG=%~dp0logs\server.log"

:loop
echo ============================================================
echo   RPT Management Server
echo   On this PC:  http://localhost:4000
echo   Clients:     http://10.1.1.16:4000
echo   (close this window to stop the server)
echo ============================================================
echo [%date% %time%] starting, data dir %RPT_DATA_DIR%>> "%LOG%"
"%NODE%" server.js >> "%LOG%" 2>&1
echo [%date% %time%] server exited (code %errorlevel%) - retry in 5s>> "%LOG%"
echo Server stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
