@echo off
chcp 65001 >nul
title KVC GCS Frontend (Port 5173)

echo ========================================================
echo   KVC SAR UAV - GCS Web Dashboard (Vite / React)
echo ========================================================
echo.

cd /d "%~dp0..\gcs\frontend"

if not exist "node_modules" (
    echo [THONG BAO] Dang cai dat thu vien node_modules lan dau...
    call npm install
)

echo Dang khoi dong Web GCS Frontend tai http://localhost:5173 ...
echo --------------------------------------------------------

call npm run dev

set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo --------------------------------------------------------
if %EXIT_CODE% equ 0 (
    echo Frontend da dung.
) else (
    echo [CANH BAO] Frontend gap loi (Ma loi: %EXIT_CODE%)
)
echo.
echo Nhan phim bat ky de thoat...
pause >nul

