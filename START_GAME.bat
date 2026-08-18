@echo off
title NEXUS DRIVE - Server & Game Launcher
cd /d "%~dp0"

echo ========================================================
echo        🏎️ NEXUS DRIVE - 3D AI CAR RACING SIMULATION
echo ========================================================
echo [1/3] Clearing old ports...
powershell -Command "Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo [2/3] Starting Local Game Server...
start "" /b node relay_server.js

echo [3/3] Launching Game in Default Browser...
timeout /t 2 /nobreak >nul
start http://localhost:8080

echo.
echo ✅ GAME RUNNING AT: http://localhost:8080
echo Keep this window open or minimize it during play.
echo ========================================================
pause
