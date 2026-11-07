@echo off
title 4Rent Management System v1.0.0
echo ==========================================================
echo   4Rent Management System v1.0.0 - Desktop Launcher
echo ==========================================================
echo.

cd /d "%~dp0"
set "APP_URL=https://splikaa.github.io/4Rent/?desktop=1"
set "SHORTCUT_NAME=4Rent Launcher.lnk"

:: Remove legacy shortcut if present
if exist "%USERPROFILE%\Desktop\4Rent Apartment System.lnk" del /q "%USERPROFILE%\Desktop\4Rent Apartment System.lnk" >nul 2>&1

:: Ensure "4Rent Launcher" shortcut exists on Desktop
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desk = [Environment]::GetFolderPath('Desktop'); $old = Join-Path $desk '4Rent Apartment System.lnk'; if (Test-Path $old) { Remove-Item $old -Force }; $s = $ws.CreateShortcut((Join-Path $desk '%SHORTCUT_NAME%')); $edge = '${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe'; if (-not (Test-Path $edge)) { $edge = '${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe' }; if (Test-Path $edge) { $s.TargetPath = $edge; $s.Arguments = '--app=%APP_URL%'; $s.IconLocation = $edge + ',0' } else { $s.TargetPath = '%APP_URL%' }; $s.Description = '4Rent Management System v1.0.0'; $s.Save()"

:: If Electron binary is available locally, launch native Electron window
if exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo Launching 4Rent Management System in Electron...
  start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0electron\main.cjs"
  exit /b 0
)

:: Otherwise launch standalone Desktop App Window
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=%APP_URL%
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=%APP_URL%
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=%APP_URL%
) else (
  start "" "%APP_URL%"
)
exit /b 0
