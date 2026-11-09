@echo off
title 4Rent Management System v1.0.0
echo ==========================================================
echo   4Rent Management System v1.0.0 - Standalone Launcher
echo   Zero-Installation Full-Screen Desktop Experience
echo ==========================================================
echo.

cd /d "%~dp0"
set "APP_URL=https://splikaa.github.io/4Rent/?desktop=1"
set "SHORTCUT_NAME=4Rent Management System.lnk"

:: Clean legacy shortcut names if present
if exist "%USERPROFILE%\Desktop\4Rent Apartment System.lnk" del /q "%USERPROFILE%\Desktop\4Rent Apartment System.lnk" >nul 2>&1
if exist "%USERPROFILE%\Desktop\4Rent Launcher.lnk" del /q "%USERPROFILE%\Desktop\4Rent Launcher.lnk" >nul 2>&1

:: Create / update official 4Rent Full-Screen Desktop Shortcut
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desk = [Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut((Join-Path $desk '%SHORTCUT_NAME%')); $edge = '${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe'; if (-not (Test-Path $edge)) { $edge = '${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe' }; $chrome = '${env:ProgramFiles}\Google\Chrome\Application\chrome.exe'; if (Test-Path $edge) { $s.TargetPath = $edge; $s.Arguments = '--app=%APP_URL% --start-maximized'; $s.IconLocation = $edge + ',0' } elseif (Test-Path $chrome) { $s.TargetPath = $chrome; $s.Arguments = '--app=%APP_URL% --start-maximized'; $s.IconLocation = $chrome + ',0' } else { $s.TargetPath = '%APP_URL%' }; $s.Description = '4Rent Management System - Full Screen Standalone'; $s.Save()"

echo [4Rent] Starting Desktop App in Full Screen...

:: 1. Try Microsoft Edge (built-in on every Windows 10 & 11) in Standalone App mode (Maximized)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%APP_URL%" --start-maximized
  exit /b 0
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%APP_URL%" --start-maximized
  exit /b 0
)

:: 2. Try Google Chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%APP_URL%" --start-maximized
  exit /b 0
)

if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%APP_URL%" --start-maximized
  exit /b 0
)

:: 3. Fallback to default browser
start "" "%APP_URL%"
exit /b 0
