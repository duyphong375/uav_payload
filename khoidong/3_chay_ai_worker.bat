@echo off
chcp 65001 >nul
title KVC - Nhan Dien AI YOLO11n (RTX 4060)

echo ========================================================
echo   KVC SAR UAV - NHAN DIEN MUC TIEU AI THOI GIAN THUC
echo   Model: YOLO11n (person / lifebuoy) - GPU: RTX 4060
echo ========================================================
echo.

cd /d "%~dp0.."

:: 1. Kiem tra Python ho tro CUDA
set "PYTHON_EXE=C:\Program Files\Python313\python.exe"
if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
)

:: 2. Kiem tra Backend GCS cong 8000
echo [1/3] Dang kiem tra ket noi Backend GCS (cong 8000)...
powershell -Command "$client = New-Object System.Net.Sockets.TcpClient; try { $client.Connect('127.0.0.1', 8000); exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% equ 0 goto :backend_ok

echo.
echo [CANH BAO] Backend GCS chua duoc bat hoac chua san sang!
echo Hay chac chan rang Backend GCS dang chay truoc khi mo AI.
echo Nhan phim bat ky de tiep tuc thu mo AI, hoac dong cua so nay...
pause >nul
goto :continue_start

:backend_ok
echo [OK] Backend GCS dang hoat dong tot.

:continue_start
:: 3. Thiet lap tham so
:: Mac dinh: Doc tu Backend relay, GPU RTX 4060 (device 0), do phan giai 480, confidence >= 25%
set "ARGS=--source http://127.0.0.1:8000/video/stream --device 0 --imgsz 480 --conf 0.25"
if not "%~1"=="" (
    set "ARGS=%*"
)

echo.
echo [2/3] Cau hinh chay AI:
echo - Nguon video: http://127.0.0.1:8000/video/stream
echo - Phat stream: http://127.0.0.1:8090/
echo - Phan cung  : GPU NVIDIA GeForce RTX 4060
echo.

:: 4. Huong dan xem truc tiep tren Web Dashboard
echo [3/3] AI Worker dang khoi dong tren GPU RTX 4060...
echo [Huong dan] Ban co the xem truc tiep luong AI tren Web Dashboard (http://localhost:5173).
echo    (Chon nut [AI YOLO] tren khung Video Panel de xem luong da ve bounding box)

echo --------------------------------------------------------
echo Nhan Ctrl+C de dung AI Worker bat ky luc nao.
echo --------------------------------------------------------
echo.

"%PYTHON_EXE%" scripts\manual\run_stream.py %ARGS%

set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo --------------------------------------------------------
if %EXIT_CODE% equ 0 (
    echo AI Worker da ket thuc binh thuong.
) else (
    echo [CANH BAO] AI Worker ket thuc voi ma loi: %EXIT_CODE%
)
echo.
pause
