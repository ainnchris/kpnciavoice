@echo off
setlocal
cd /d "%~dp0"
title KPNC Voice Engine - Setup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_windows.ps1"
endlocal
