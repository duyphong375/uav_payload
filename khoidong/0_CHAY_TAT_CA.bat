@echo off
chcp 65001 >nul
title KVC Master Launcher - Khoi Dong Tat Ca

echo ========================================================
echo   KVC SAR UAV - KHOI DONG HE THONG TRAM MAT DAT
echo ========================================================
echo.

:: 1. Khoi chay Backend
echo [1/2] Dang khoi chay Backend GCS (cong 8000)...
start "1. KVC Backend (:8000)" cmd /c ""%~dp01_chay_backend.bat""

echo Cho 3 giay de Backend on dinh...
timeout /t 3 /nobreak >nul

:: 2. Khoi chay Frontend
echo [2/2] Dang khoi chay GCS Frontend (cong 5173)...
start "2. KVC Frontend (:5173)" cmd /c ""%~dp02_chay_frontend.bat""

echo Cho 3 giay de Frontend san sang...
timeout /t 3 /nobreak >nul

:: 3. Mo trinh duyet Web Dashboard
echo.
echo Dang mo GCS Dashboard tren trinh duyet web...
start http://localhost:5173

echo.
echo ========================================================
echo   DA KHOI DONG THANH CONG CAC DICH VU!
echo ========================================================
echo   * Backend GCS : http://127.0.0.1:8000
echo   * Frontend Web: http://localhost:5173
echo.
echo Ghi chu: Moi tien trinh chay tren 1 cua so console rieng biet.
echo De tat bat ky dich vu nao, hay dong cua so console tuong ung.
echo (Neu muon chay them AI YOLO11n tren GPU, hay chay rieng file 3_chay_ai_worker.bat)
echo.
echo Nhan phim bat ky de dong cua so tong nay...
pause >nul
