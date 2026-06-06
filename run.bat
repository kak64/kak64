@echo off
REM ===== Homly - one-click run for Windows =====
REM Double-click this file to install, build and start the app.
cd /d "%~dp0"
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [X] Node.js is not installed.
  echo     Download the LTS version from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/3] Installing dependencies ^(first run only^)...
  call npm install || (echo Install failed. & pause & exit /b 1)
) else (
  echo [1/3] Dependencies already installed.
)

echo [2/3] Building the app...
call npm run build || (echo Build failed. & pause & exit /b 1)

echo [3/3] Starting Homly on http://localhost:3001
start "" http://localhost:3001
call npm start

pause
