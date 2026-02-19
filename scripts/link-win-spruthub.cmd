@echo off
setlocal

set PLUGIN_NAME=com.isrudoy.spruthub.sdPlugin
set PLUGIN_DIR=%APPDATA%\HotSpot\StreamDock\plugins\%PLUGIN_NAME%
set WSL_DIR=%~dp0..\%PLUGIN_NAME%

if exist "%PLUGIN_DIR%" (
    echo Plugin already linked: %PLUGIN_DIR%
    echo To re-link, delete the existing link first:
    echo   rmdir "%PLUGIN_DIR%"
    exit /b 1
)

mklink /D "%PLUGIN_DIR%" "%WSL_DIR%"
if %errorlevel% equ 0 (
    echo Done! Restart StreamDock to load the plugin.
) else (
    echo Failed. Run this script as Administrator.
)
