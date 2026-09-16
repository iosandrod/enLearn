@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sftp-sync.ps1" -Mode Deploy %*
if errorlevel 1 pause
