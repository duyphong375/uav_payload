#requires -Version 5.1
<#
.SYNOPSIS
KVC firmware test runner: MCU host tests, gateway host tests, gateway build, Python tests.

.DESCRIPTION
Chạy toàn bộ kiểm thử firmware của bản sản phẩm bằng một lệnh, theo đúng thứ tự
link mà từng test cần. Trước đây mỗi test phải nhớ lệnh riêng và lệnh trong
README bị sai trên Windows (gcc không expand `*.c`), nên kết quả không tái lập được.

Các bước (mỗi bước in PASS/FAIL kèm exit code):
  1. MCU host tests (gcc, không cần board):
     - test_kvc_uart_ring     : ring buffer SPSC
     - test_kvc_timebase      : time base monotonic dùng chung
     - test_kvc_fpga_bbox     : driver UART1 + file nguồn sensors/kvc_fpga_bbox.c
     - test_kvc_gnss_neo_m10  : driver NMEA + file nguồn sensors/kvc_gnss_neo_m10.c
     - test_kvc_usound_decode : giải mã khung 4 byte AJ-SR04M + sensors/kvc_usound_decode.c
     - test_kvc_geo_math      : lượng giác số nguyên cho georef + src/kvc_geo_math.c
  2. Gateway host tests (g++): test_rf_decode.cpp + src/rf_decode.cpp,
     test_net_policy.cpp + src/net_policy.cpp,
     test_session_id.cpp + src/session_id.cpp
  3. Gateway build (PlatformIO) — bỏ qua bằng -SkipBuild
  4. Python tests (pytest) — bỏ qua bằng -SkipPython

Không nạp flash, không mở serial, không đụng phần cứng.

.PARAMETER SkipBuild
Bỏ qua bước build gateway (dùng khi chỉ sửa driver MCU).

.PARAMETER SkipPython
Bỏ qua pytest (dùng khi chỉ kiểm tra firmware).

.PARAMETER KeepArtifacts
Giữ file .exe đã build trong thư mục tạm thay vì xóa sau khi chạy.

.EXAMPLE
pwsh -File scripts/test_firmware.ps1
.EXAMPLE
pwsh -File scripts/test_firmware.ps1 -SkipBuild -SkipPython

.NOTES
Exit code 0 = mọi bước PASS. Khác 0 = có bước FAIL hoặc tool thiếu.
Tool thiếu được báo NOT RUN, không bao giờ báo PASS.
#>
[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$SkipPython,
    [switch]$KeepArtifacts
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path ([System.IO.Path]::GetTempPath()) 'kvc_firmware_tests'
$mcuInc = Join-Path $root 'firmware/mcu_payload/inc'
$mcuTests = Join-Path $root 'firmware/mcu_payload/tests'
$mcuSensors = Join-Path $root 'firmware/mcu_payload/src/sensors'
$mcuSrc = Join-Path $root 'firmware/mcu_payload/src'
$gwSrc = Join-Path $root 'firmware/gateway_esp32/src'
$gwTest = Join-Path $root 'firmware/gateway_esp32/host_tests'
$pythonExe = Join-Path $root '.venv/Scripts/python.exe'

$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param([string]$Name, [string]$Status, [string]$Detail)
    $results.Add([pscustomobject]@{ Step = $Name; Status = $Status; Detail = $Detail })
}

function Invoke-TestBinary {
    param(
        [string]$Name,
        [string]$Compiler,
        [string[]]$Arguments,
        [string]$OutputExe
    )

    Write-Host ''
    Write-Host "=== $Name ===" -ForegroundColor Cyan

    & $Compiler @Arguments 2>&1 | ForEach-Object { Write-Host $_ }
    $buildExit = $LASTEXITCODE
    if ($buildExit -ne 0) {
        Write-Host "BUILD FAIL (exit $buildExit)" -ForegroundColor Red
        Add-Result -Name $Name -Status 'FAIL' -Detail "build exit $buildExit"
        return
    }

    & $OutputExe 2>&1 | ForEach-Object { Write-Host $_ }
    $runExit = $LASTEXITCODE
    if ($runExit -ne 0) {
        Write-Host "TEST FAIL (exit $runExit)" -ForegroundColor Red
        Add-Result -Name $Name -Status 'FAIL' -Detail "run exit $runExit"
        return
    }

    Write-Host 'PASS' -ForegroundColor Green
    Add-Result -Name $Name -Status 'PASS' -Detail 'exit 0'
}

if (-not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

# --- Toolchain ---
$gcc = Get-Command gcc -ErrorAction SilentlyContinue
$gpp = Get-Command g++ -ErrorAction SilentlyContinue

# --- 1. MCU host tests ---
if ($null -eq $gcc) {
    Add-Result -Name 'MCU host tests' -Status 'NOT RUN' -Detail 'gcc khong co trong PATH'
} else {
    $common = @('-Wall', '-Wextra', '-O2', '-std=c99', '-DKVC_HOST_TEST=1', "-I$mcuInc")

    Invoke-TestBinary -Name 'MCU test_kvc_uart_ring' -Compiler $gcc.Source `
        -Arguments ($common + @(
            (Join-Path $mcuTests 'test_kvc_uart_ring.c'),
            '-o', (Join-Path $outDir 'test_kvc_uart_ring.exe'))) `
        -OutputExe (Join-Path $outDir 'test_kvc_uart_ring.exe')

    Invoke-TestBinary -Name 'MCU test_kvc_timebase' -Compiler $gcc.Source `
        -Arguments ($common + @(
            (Join-Path $mcuTests 'test_kvc_timebase.c'),
            (Join-Path $mcuSrc 'kvc_timebase.c'),
            '-o', (Join-Path $outDir 'test_kvc_timebase.exe'))) `
        -OutputExe (Join-Path $outDir 'test_kvc_timebase.exe')

    Invoke-TestBinary -Name 'MCU test_kvc_ubx_cfg' -Compiler $gcc.Source `
        -Arguments ($common + @(
            (Join-Path $mcuTests 'test_kvc_ubx_cfg.c'),
            (Join-Path $mcuSrc 'kvc_ubx_cfg.c'),
            '-o', (Join-Path $outDir 'test_kvc_ubx_cfg.exe'))) `
        -OutputExe (Join-Path $outDir 'test_kvc_ubx_cfg.exe')

    Invoke-TestBinary -Name 'MCU test_kvc_fpga_bbox' -Compiler $gcc.Source `
        -Arguments ($common + @(
            (Join-Path $mcuTests 'test_kvc_fpga_bbox.c'),
            (Join-Path $mcuSensors 'kvc_fpga_bbox.c'),
            '-o', (Join-Path $outDir 'test_kvc_fpga_bbox.exe'))) `
        -OutputExe (Join-Path $outDir 'test_kvc_fpga_bbox.exe')

    Invoke-TestBinary -Name 'MCU test_kvc_gnss_neo_m10' -Compiler $gcc.Source `
        -Arguments ($common + @(
            (Join-Path $mcuTests 'test_kvc_gnss_neo_m10.c'),
            (Join-Path $mcuSensors 'kvc_gnss_neo_m10.c'),
            '-o', (Join-Path $outDir 'test_kvc_gnss_neo_m10.exe'))) `
        -OutputExe (Join-Path $outDir 'test_kvc_gnss_neo_m10.exe')

    Invoke-TestBinary -Name 'MCU test_kvc_usound_decode' -Compiler $gcc.Source `
        -Arguments ($common + @(
            (Join-Path $mcuTests 'test_kvc_usound_decode.c'),
            (Join-Path $mcuSensors 'kvc_usound_decode.c'),
            '-o', (Join-Path $outDir 'test_kvc_usound_decode.exe'))) `
        -OutputExe (Join-Path $outDir 'test_kvc_usound_decode.exe')

    Invoke-TestBinary -Name 'MCU test_kvc_geo_math' -Compiler $gcc.Source `
        -Arguments ($common + @(
            (Join-Path $mcuTests 'test_kvc_geo_math.c'),
            (Join-Path $mcuSrc 'kvc_geo_math.c'),
            '-o', (Join-Path $outDir 'test_kvc_geo_math.exe'))) `
        -OutputExe (Join-Path $outDir 'test_kvc_geo_math.exe')

    # KVC-MCU-GEO-001: georef tách khỏi main.c, link kèm geo_math (dùng bảng sin).
    Invoke-TestBinary -Name 'MCU test_kvc_georef' -Compiler $gcc.Source `
        -Arguments ($common + @(
            (Join-Path $mcuTests 'test_kvc_georef.c'),
            (Join-Path $mcuSrc 'kvc_georef.c'),
            (Join-Path $mcuSrc 'kvc_geo_math.c'),
            '-o', (Join-Path $outDir 'test_kvc_georef.exe'))) `
        -OutputExe (Join-Path $outDir 'test_kvc_georef.exe')

    # KVC-MCU-TELEMETRY-TEST-001: khoá ABI IF-02 + golden vector GV-02 ở host.
    Invoke-TestBinary -Name 'MCU test_kvc_telemetry' -Compiler $gcc.Source `
        -Arguments ($common + @(
            (Join-Path $mcuTests 'test_kvc_telemetry.c'),
            '-o', (Join-Path $outDir 'test_kvc_telemetry.exe'))) `
        -OutputExe (Join-Path $outDir 'test_kvc_telemetry.exe')

    # KVC-MCU-US-FILTER-001: bộ lọc trung vị + chặn ngoại lai + giữ mẫu.
    Invoke-TestBinary -Name 'MCU test_kvc_usound_filter' -Compiler $gcc.Source `
        -Arguments ($common + @(
            (Join-Path $mcuTests 'test_kvc_usound_filter.c'),
            (Join-Path $mcuSrc 'sensors\kvc_usound_filter.c'),
            (Join-Path $mcuSrc 'sensors\kvc_usound_decode.c'),
            '-o', (Join-Path $outDir 'test_kvc_usound_filter.exe'))) `
        -OutputExe (Join-Path $outDir 'test_kvc_usound_filter.exe')
}

# --- 2. Gateway host test ---
if ($null -eq $gpp) {
    Add-Result -Name 'Gateway host tests' -Status 'NOT RUN' -Detail 'g++ khong co trong PATH'
} else {
    $gwCommon = @('-std=c++17', '-Wall', '-Wextra', '-O2', "-I$gwSrc")

    Invoke-TestBinary -Name 'Gateway test_rf_decode' -Compiler $gpp.Source `
        -Arguments ($gwCommon + @(
            (Join-Path $gwTest 'test_rf_decode.cpp'),
            (Join-Path $gwSrc 'rf_decode.cpp'),
            '-o', (Join-Path $outDir 'test_rf_decode.exe'))) `
        -OutputExe (Join-Path $outDir 'test_rf_decode.exe')

    Invoke-TestBinary -Name 'Gateway test_net_policy' -Compiler $gpp.Source `
        -Arguments ($gwCommon + @(
            (Join-Path $gwTest 'test_net_policy.cpp'),
            (Join-Path $gwSrc 'net_policy.cpp'),
            '-o', (Join-Path $outDir 'test_net_policy.exe'))) `
        -OutputExe (Join-Path $outDir 'test_net_policy.exe')

    # IF-03 muc 3: gateway_session_id phai doi moi lan boot (truoc day la hang
    # so 1 nen hai phien boot bi tron khi replay).
    Invoke-TestBinary -Name 'Gateway test_session_id' -Compiler $gpp.Source `
        -Arguments ($gwCommon + @(
            (Join-Path $gwTest 'test_session_id.cpp'),
            (Join-Path $gwSrc 'session_id.cpp'),
            '-o', (Join-Path $outDir 'test_session_id.exe'))) `
        -OutputExe (Join-Path $outDir 'test_session_id.exe')
}

# --- 3. Gateway build ---
if ($SkipBuild) {
    Add-Result -Name 'Gateway platformio run' -Status 'SKIPPED' -Detail '-SkipBuild'
} elseif ($null -eq $pythonExe -or -not (Test-Path -LiteralPath $pythonExe)) {
    Add-Result -Name 'Gateway platformio run' -Status 'NOT RUN' -Detail 'khong tim thay .venv/Scripts/python.exe'
} else {
    Write-Host ''
    Write-Host '=== Gateway platformio run ===' -ForegroundColor Cyan
    & $pythonExe -m platformio run -d (Join-Path $root 'firmware/gateway_esp32') 2>&1 |
        ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'PASS' -ForegroundColor Green
        Add-Result -Name 'Gateway platformio run' -Status 'PASS' -Detail 'exit 0'
    } else {
        Write-Host "BUILD FAIL (exit $LASTEXITCODE)" -ForegroundColor Red
        Add-Result -Name 'Gateway platformio run' -Status 'FAIL' -Detail "exit $LASTEXITCODE"
    }
}

# --- 4. Python tests ---
if ($SkipPython) {
    Add-Result -Name 'pytest' -Status 'SKIPPED' -Detail '-SkipPython'
} elseif ($null -eq $pythonExe -or -not (Test-Path -LiteralPath $pythonExe)) {
    Add-Result -Name 'pytest' -Status 'NOT RUN' -Detail 'khong tim thay .venv/Scripts/python.exe'
} else {
    Write-Host ''
    Write-Host '=== pytest ===' -ForegroundColor Cyan
    Push-Location $root
    try {
        & $pythonExe -B -m pytest -q -p no:cacheprovider 2>&1 | ForEach-Object { Write-Host $_ }
        $pytestExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($pytestExit -eq 0) {
        Write-Host 'PASS' -ForegroundColor Green
        Add-Result -Name 'pytest' -Status 'PASS' -Detail 'exit 0'
    } else {
        Write-Host "TEST FAIL (exit $pytestExit)" -ForegroundColor Red
        Add-Result -Name 'pytest' -Status 'FAIL' -Detail "exit $pytestExit"
    }
}

if (-not $KeepArtifacts) {
    Get-ChildItem -LiteralPath $outDir -Filter '*.exe' -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue
}

# --- Summary ---
Write-Host ''
Write-Host '================================================================' -ForegroundColor Cyan
Write-Host '  TONG KET KIEM THU FIRMWARE'
Write-Host '================================================================' -ForegroundColor Cyan
$results | ForEach-Object {
    $color = switch ($_.Status) {
        'PASS'    { 'Green' }
        'SKIPPED' { 'Yellow' }
        'NOT RUN' { 'Yellow' }
        default   { 'Red' }
    }
    Write-Host ("  {0,-30} {1,-9} {2}" -f $_.Step, $_.Status, $_.Detail) -ForegroundColor $color
}
Write-Host '================================================================' -ForegroundColor Cyan

$failed = @($results | Where-Object { $_.Status -eq 'FAIL' }).Count
$notRun = @($results | Where-Object { $_.Status -eq 'NOT RUN' }).Count

if ($failed -gt 0) {
    Write-Host "KET QUA: FAIL ($failed buoc that bai)" -ForegroundColor Red
    exit 1
}
if ($notRun -gt 0) {
    Write-Host "KET QUA: KHONG DAY DU ($notRun buoc NOT RUN do thieu tool)" -ForegroundColor Yellow
    exit 2
}
Write-Host 'KET QUA: TAT CA PASS' -ForegroundColor Green
exit 0
