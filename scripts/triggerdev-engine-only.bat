@echo off
setlocal
cd /d "%~dp0\.."
call pnpm triggerdev:up
if errorlevel 1 exit /b %ERRORLEVEL%
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0triggerdev-bootstrap.ps1" -EngineOnly %*
exit /b %ERRORLEVEL%
