@echo off
chcp 65001 >nul
title KVC GCS Backend (Port 8000)

echo ========================================================
echo   KVC SAR UAV - GCS Backend Gateway (FastAPI)
echo ========================================================
echo.

cd /d "%~dp0.."

if not exist ".venv\Scripts\python.exe" (
    echo [LOI] Khong tim thay Python trong .venv tai %CD%\.venv!
    echo Vui long kiem tra lai moi truong ao.
    pause
    exit /b 1
)

:: Kich hoat ket noi phan cung that (ESP32-C3 Gateway va ESP32-S3-CAM)
set "KVC_ENABLE_ESP32=1"
set "KVC_ESP32_WS_URL=ws://esp32c3-91434c.mshome.net:8080/telemetry"

set "KVC_ENABLE_VIDEO_RELAY=1"
set "KVC_VIDEO_SOURCE_URL=http://kvc-s3cam.mshome.net:81/stream"

echo [Cau hinh phan cung that]
echo - Gateway ESP32-C3 : %KVC_ESP32_WS_URL%
echo - Camera ESP32-S3  : %KVC_VIDEO_SOURCE_URL%
echo.
echo Dang khoi chay GCS Backend tai http://127.0.0.1:8000 ...
echo - WebSocket noi bo : ws://127.0.0.1:8000/ws/telemetry
echo - API Docs         : http://127.0.0.1:8000/docs
echo --------------------------------------------------------

".venv\Scripts\python.exe" -m uvicorn gcs.backend.main:app --host 127.0.0.1 --port 8000

set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo --------------------------------------------------------
if %EXIT_CODE% equ 0 (
    echo Backend da dung.
) else (
    echo [CANH BAO] Backend gap loi hoac bi dung dot ngot (Ma loi: %EXIT_CODE%)
)
echo.
echo Nhan phim bat ky de thoat...
pause >nul
