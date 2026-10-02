@echo off
echo 正在关闭 3300 端口...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3300" ^| findstr "LISTENING"') do (
    echo PID: %%a
    taskkill /F /PID %%a
)

echo.
echo 完成。
pause