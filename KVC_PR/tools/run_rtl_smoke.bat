@echo off
setlocal
REM Requires Icarus Verilog (iverilog + vvp) on PATH.
cd /d "%~dp0\.."
if not exist build_rtl mkdir build_rtl
iverilog -g2012 -s tb_conv_engine_dynamic -o build_rtl\tb_conv_engine_dynamic.vvp rtl\gen\conv_engine_dynamic.v tb\tb_conv_engine_dynamic.v
if errorlevel 1 exit /b 1
vvp build_rtl\tb_conv_engine_dynamic.vvp
if errorlevel 1 exit /b 1
iverilog -g2012 -s tb_image_letterbox_sync -o build_rtl\tb_image_letterbox_sync.vvp src\image_letterbox.v tb\tb_image_letterbox_sync.v
if errorlevel 1 exit /b 1
vvp build_rtl\tb_image_letterbox_sync.vvp
if errorlevel 1 exit /b 1
echo RTL SMOKE TESTS COMPLETED
endlocal
