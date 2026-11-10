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
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desk = [Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut((Join-Path $desk '%SHORTCUT_NAME%')); $edge = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe' -ErrorAction SilentlyContinue).'(Default)'; $chrome = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction SilentlyContinue).'(Default)'; $target = if ($edge -and (Test-Path $edge)) { $edge } elseif ($chrome -and (Test-Path $chrome)) { $chrome } else { (Join-Path $env:SystemRoot 'explorer.exe') }; if ($target -match 'msedge|chrome') { $s.TargetPath = $target; $s.Arguments = '--app=%APP_URL% --start-maximized'; $s.IconLocation = $target + ',0' } else { $s.TargetPath = $target; $s.Arguments = '%APP_URL%'; $s.IconLocation = $target + ',0' }; $s.Description = '4Rent Management System - Full Screen Standalone'; $s.Save()"

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
