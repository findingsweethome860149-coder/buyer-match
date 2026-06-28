@echo off
cd /d "%~dp0"

:: 優先用 Python 啟動本機伺服器
where python >nul 2>&1
if %errorlevel%==0 (
  start "" /b python -m http.server 17300 --bind 127.0.0.1 >nul 2>&1
  timeout /t 1 /nobreak >nul
  start "" "http://127.0.0.1:17300"
  exit /b
)

where python3 >nul 2>&1
if %errorlevel%==0 (
  start "" /b python3 -m http.server 17300 --bind 127.0.0.1 >nul 2>&1
  timeout /t 1 /nobreak >nul
  start "" "http://127.0.0.1:17300"
  exit /b
)

:: 沒有 Python，直接開檔案
start "" "%~dp0index.html"
