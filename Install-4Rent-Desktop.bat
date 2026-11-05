@echo off
title 4Rent Desktop Application Installer (Developed by splikaa)
echo ================================================================
echo   Installing 4Rent Apartment ^& Sub-Meter System (v1.2.0)
echo   Developed by splikaa
echo ================================================================
echo.
set "APP_URL=https://splikaa.github.io/4Rent/"
set "SHORTCUT=%USERPROFILE%\Desktop\4Rent Apartment System.lnk"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); if (Test-Path 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe') { $s.TargetPath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; $s.Arguments = '--app=%APP_URL%'; } elseif (Test-Path 'C:\Program Files\Google\Chrome\Application\chrome.exe') { $s.TargetPath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'; $s.Arguments = '--app=%APP_URL%'; } else { $s.TargetPath = '%APP_URL%'; }; $s.Description = '4Rent Apartment Management System by splikaa'; $s.Save()"

echo [SUCCESS] "4Rent Apartment System" shortcut installed on Desktop!
echo Launching 4Rent Desktop Application...
start "" "msedge" --app=https://splikaa.github.io/4Rent/ 2>nul || start "" "https://splikaa.github.io/4Rent/"
exit
