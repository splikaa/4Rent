@echo off
title 4Rent Management System v1.0.0 - Mobile APK Builder
echo ==========================================================
echo   4Rent Management System v1.0.0 - Flutter Mobile Builder
echo ==========================================================
echo.
cd /d "%~dp0"
where flutter >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [INFO] Flutter SDK is required to compile the native Android .APK or iOS build.
  echo Install Flutter from https://docs.flutter.dev/get-started/install
  echo Then run: flutter pub get ^&^& flutter build apk --release
  pause
  exit /b 1
)
echo Installing Flutter dependencies...
call flutter pub get
echo Building installable Android Release APK...
call flutter build apk --release
echo.
echo [SUCCESS] Installable APK generated at:
echo build\app\outputs\flutter-apk\app-release.apk
pause
