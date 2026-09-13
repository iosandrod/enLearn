@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0docker-sync.ps1"
if errorlevel 1 pause
