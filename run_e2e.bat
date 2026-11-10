@echo off
setlocal EnableDelayedExpansion

:: 4Rent E2E Test Suite Runner
:: Portable execution wrapper using Node.js / VS Code Embedded Node 24

cd /d "%~dp0"

:: 1. Locate Node.js executable
set "NODE_EXE="

:: Option A: Check system PATH
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  set "NODE_EXE=node"
  goto :found_node
)

:: Option B: Check VS Code Embedded Node 24
if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe" (
  set "NODE_EXE=%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"
  set "ELECTRON_RUN_AS_NODE=1"
  goto :found_node
)

if exist "C:\Users\Gameiun Peso NEt\AppData\Local\Programs\Microsoft VS Code\Code.exe" (
  set "NODE_EXE=C:\Users\Gameiun Peso NEt\AppData\Local\Programs\Microsoft VS Code\Code.exe"
  set "ELECTRON_RUN_AS_NODE=1"
  goto :found_node
)

if exist "%ProgramFiles%\Microsoft VS Code\Code.exe" (
  set "NODE_EXE=%ProgramFiles%\Microsoft VS Code\Code.exe"
  set "ELECTRON_RUN_AS_NODE=1"
  goto :found_node
)

echo [4Rent E2E Error] Node.js runtime not found in PATH or VS Code installation.
exit /b 1

:found_node
:: 2. Execute E2E Master Runner with Custom ESM / TS Loader Hook
"%NODE_EXE%" --import "./tests/e2e/harness/register_loader.mjs" "tests/e2e/run_all_e2e.ts" %*
set "TEST_EXIT_CODE=%ERRORLEVEL%"

exit /b %TEST_EXIT_CODE%
