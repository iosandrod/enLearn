@echo off
setlocal
cd /d "%~dp0\.."
call pnpm triggerdev:up
if errorlevel 1 exit /b %ERRORLEVEL%
call "%~dp0triggerdev-bootstrap.bat" %*
exit /b %ERRORLEVEL%
