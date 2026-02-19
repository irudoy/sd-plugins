@echo off
taskkill /IM StreamDock.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul
start "" "C:\Program Files (x86)\StreamDock\StreamDock.exe"
echo StreamDock restarted.
