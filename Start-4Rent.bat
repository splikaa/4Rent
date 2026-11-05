@echo off
title 4Rent — Desktop & Mobile Apartment Management System
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
echo ==========================================================
echo   4Rent v1.0.0 — Apartment ^& Sub-Meter Management System
echo   Starting Desktop ^& Mobile Local Network Server...
echo ==========================================================
start "" "http://localhost:5173"
call npm.cmd run dev
pause

