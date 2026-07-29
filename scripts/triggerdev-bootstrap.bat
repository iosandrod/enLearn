@echo off
setlocal
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0triggerdev-bootstrap.ps1" %*
exit /b %ERRORLEVEL%
