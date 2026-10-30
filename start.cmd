@echo off
setlocal
title lifeapp  -  http://127.0.0.1:8787/
cd /d "%~dp0"

echo.
echo   lifeapp   http://127.0.0.1:8787/
echo   ------------------------------------------------------------
echo   The browser opens by itself after the server is ready.
echo   If no page shows up, paste the address above into the browser.
echo   Keep this window open while you use the app.
echo   ------------------------------------------------------------
echo.

where node >nul 2>nul
if not errorlevel 1 goto :usenode

where python >nul 2>nul
if not errorlevel 1 goto :usepy

echo   No node and no python found on this computer.
echo   Install either one, then double click this file again.
echo.
pause
exit /b 1

:usenode
node serve.js
goto :done

:usepy
start "" http://127.0.0.1:8787/
echo   Serving with python. If the page is blank, refresh it once.
python -m http.server 8787 --bind 127.0.0.1
goto :done

:done
echo.
echo   Server stopped. Your data is still in the browser.
pause
