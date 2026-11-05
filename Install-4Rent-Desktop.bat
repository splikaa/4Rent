@echo off
title 4Rent Desktop Application Installer (Developed by splikaa)
echo ================================================================
echo   Installing 4Rent Apartment ^& Sub-Meter System (v1.3.0)
echo   Developed by splikaa
echo ================================================================
echo.
set "APP_URL=https://splikaa.github.io/4Rent/"
set "ICON_DIR=%LOCALAPPDATA%\4Rent"
set "ICON_PATH=%LOCALAPPDATA%\4Rent\4rent-icon.ico"
set "SHORTCUT=%USERPROFILE%\Desktop\4Rent Apartment System.lnk"

if not exist "%ICON_DIR%" mkdir "%ICON_DIR%"
if exist "%~dp0public\4rent-icon.ico" (
  copy /Y "%~dp0public\4rent-icon.ico" "%ICON_PATH%" >nul
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'https://splikaa.github.io/4Rent/4rent-icon.ico' -OutFile '%ICON_PATH%' -UseBasicParsing } catch {}"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); if (Test-Path 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe') { $s.TargetPath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; $s.Arguments = '--app=%APP_URL%'; } elseif (Test-Path 'C:\Program Files\Google\Chrome\Application\chrome.exe') { $s.TargetPath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'; $s.Arguments = '--app=%APP_URL%'; } else { $s.TargetPath = '%APP_URL%'; }; if (Test-Path '%ICON_PATH%') { $s.IconLocation = '%ICON_PATH%,0'; }; $s.Description = '4Rent Apartment Management System by splikaa'; $s.Save()"

ie4uinit.exe -show >nul 2>&1
echo [SUCCESS] "4Rent Apartment System" shortcut with 4Rent Icon installed on Desktop!
echo Launching 4Rent Desktop Application...
start "" "msedge" --app=https://splikaa.github.io/4Rent/ 2>nul || start "" "https://splikaa.github.io/4Rent/"
exit
