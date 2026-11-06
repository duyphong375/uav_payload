#requires -Version 5.1
<#
.SYNOPSIS
Chay toan bo testbench FPGA bang iverilog, bao cao PASS/FAIL kem exit code.

.DESCRIPTION
Moi testbench duoc compile va chay rieng (khong dung chung file .vvp) de
tranh xung dot ten module. Script dung cung mot mau nhu scripts/test_firmware.ps1:
in tung buoc + exit code, ket thuc bang bang tong ket.

.Testbench duoc chay:
  - tb_uart_tx           : framing UART 8N1, start bit
  - tb_bbox_packetizer   : Little-Endian vs parser C MCU
  - tb_conv0_golden      : engine conv voi golden doc lap
  - tb_conv0_real        : engine conv voi weights THAT tu YOLO11n
  - tb_depthwise         : engine conv voi GROUPS>1
  - tb_maxpool2d         : max pooling (SPPF co so)
  - tb_concat_n_feature  : concat N segment
  - tb_split_channels    : split channel
  - tb_upsample_nearest  : nearest neighbour upsample
  - tb_residual_add_int8 : saturating add (quet 65536 to hop)
  - tb_sppf_block        : SPPF (3 maxpool + concat)
  - tb_kvc_top_demo      : top-level mock path
  - tb_kvc_top_demo_rate : do NHIP FRAME that (26B @38400 -> ~100 FPS)
  - tb_kvc_top_demo_uartlink : bo thu 8N1 doc lap + parser IF-01 (framing/CRC)
  - tb_ov2640_config     : bang khoi tao camera day du + kiem ACK + POR delay
  - tb_sccb_ack_sample   : ACK sampling timing + SCL push-pull (vat ly bus)
  - tb_vsync_diag        : bo dem VSYNC xuat qua truong X (chan doan camera)
  - tb_pixel_stats       : thong ke mau RGB565 tren frame (muc G6.1.9)
  - tb_async_fifo_cdc    : CDC FIFO
  - tb_yolo_nms          : NMS

.PARAMETER Iverilog
Duong dan iverilog. Mac dinh lay tu PATH.

.EXAMPLE
pwsh -File scripts/run_fpga_tb.ps1
#>
param(
    [string]$Iverilog = "iverilog",
    [string]$Vvp      = "vvp",
    [string[]]$Filter = @()
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent $PSScriptRoot
$tbDir    = Join-Path $repoRoot "fpga\verification\tb"
$ktDir    = Join-Path $repoRoot "fpga\src"
$tmpDir   = Join-Path $env:TEMP ("kvc_tb_" + [guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

# Dinh nghia: ten TB + danh sach file nguon (tuong doi tu repoRoot)
$tests = @(
    @{ name="tb_uart_tx";           srcs=@("fpga\src\comm\uart_tx.v") },
    @{ name="tb_bbox_packetizer";   srcs=@("fpga\src\comm\bbox_packetizer.v","fpga\src\comm\crc16_ccitt.v") },
    @{ name="tb_conv0_golden";      srcs=@("fpga\src\conv_engine_dynamic_fsm.v") },
    @{ name="tb_conv0_real";        srcs=@("fpga\src\conv_engine_dynamic_fsm.v") },
    @{ name="tb_depthwise";         srcs=@("fpga\src\conv_engine_dynamic_fsm.v") },
    @{ name="tb_maxpool2d";         srcs=@("fpga\src\processing\maxpool2d.v") },
    @{ name="tb_concat_n_feature";  srcs=@("fpga\src\processing\concat_n_feature.v") },
    @{ name="tb_split_channels";    srcs=@("fpga\src\processing\split_channels.v") },
    @{ name="tb_upsample_nearest";  srcs=@("fpga\src\processing\upsample_nearest.v") },
    @{ name="tb_residual_add_int8"; srcs=@("fpga\src\processing\residual_add_int8.v") },
    @{ name="tb_sppf_block";        srcs=@("fpga\src\processing\sppf_block.v","fpga\src\processing\maxpool2d.v") },
    @{ name="tb_line_buffer_mc";    srcs=@("fpga\src\line_buffer_mc.v") },
    @{ name="tb_async_fifo_cdc";    srcs=@("fpga\src\async_fifo_cdc.v") },
    @{ name="tb_yolo_nms";          srcs=@("fpga\src\yolo_nms.v") },
    @{ name="tb_kvc_top_demo";      srcs=@(
        "fpga\verification\sim\sim_stubs.v",
        "fpga\src\kvc_top_demo.v",
        "fpga\src\comm\uart_tx.v",
        "fpga\src\comm\bbox_packetizer.v",
        "fpga\src\comm\crc16_ccitt.v",
        "fpga\src\comm\data_ready_ctrl.v",
        "fpga\src\comm\mock_bbox.v",
        "fpga\src\camera\camera_rx.v",
        "fpga\src\camera\ov2640_config.v",
        "fpga\src\camera\sccb_master.v",
        "fpga\src\gowin_rpll\Gowin_rPLL_100M.v",
        "fpga\src\gowin_rpll\Gowin_rPLL_24M.v"
    ) },
    @{ name="tb_kvc_top_demo_rate";  srcs=@(
        "fpga\verification\sim\sim_stubs.v",
        "fpga\src\kvc_top_demo.v",
        "fpga\src\comm\uart_tx.v",
        "fpga\src\comm\bbox_packetizer.v",
        "fpga\src\comm\crc16_ccitt.v",
        "fpga\src\comm\data_ready_ctrl.v",
        "fpga\src\comm\mock_bbox.v",
        "fpga\src\camera\camera_rx.v",
        "fpga\src\camera\ov2640_config.v",
        "fpga\src\camera\sccb_master.v",
        "fpga\src\gowin_rpll\Gowin_rPLL_100M.v",
        "fpga\src\gowin_rpll\Gowin_rPLL_24M.v"
    ) },
    @{ name="tb_kvc_top_demo_uartlink"; srcs=@(
        "fpga\verification\sim\sim_stubs.v",
        "fpga\src\kvc_top_demo.v",
        "fpga\src\comm\uart_tx.v",
        "fpga\src\comm\bbox_packetizer.v",
        "fpga\src\comm\crc16_ccitt.v",
        "fpga\src\comm\data_ready_ctrl.v",
        "fpga\src\comm\mock_bbox.v",
        "fpga\src\camera\camera_rx.v",
        "fpga\src\camera\ov2640_config.v",
        "fpga\src\camera\sccb_master.v",
        "fpga\src\gowin_rpll\Gowin_rPLL_100M.v",
        "fpga\src\gowin_rpll\Gowin_rPLL_24M.v"
    ) },
    @{ name="tb_ov2640_config"; srcs=@(
        "fpga\src\camera\ov2640_config.v"
    ) },
    @{ name="tb_sccb_ack_sample"; srcs=@(
        "fpga\src\camera\sccb_master.v"
    ) },
    @{ name="tb_vsync_diag"; srcs=@(
        "fpga\verification\sim\sim_stubs.v",
        "fpga\src\kvc_top_demo.v",
        "fpga\src\comm\uart_tx.v",
        "fpga\src\comm\bbox_packetizer.v",
        "fpga\src\comm\crc16_ccitt.v",
        "fpga\src\comm\data_ready_ctrl.v",
        "fpga\src\comm\mock_bbox.v",
        "fpga\src\camera\camera_rx.v",
        "fpga\src\camera\ov2640_config.v",
        "fpga\src\camera\sccb_master.v",
        "fpga\src\gowin_rpll\Gowin_rPLL_100M.v",
        "fpga\src\gowin_rpll\Gowin_rPLL_24M.v"
    ) },
    @{ name="tb_vsync_monitor"; srcs=@(
        "fpga\src\processing\vsync_monitor.v"
    ) },
    @{ name="tb_pixel_stats"; srcs=@(
        "fpga\src\processing\pixel_stats.v"
    ) },
    @{ name="tb_vsync_selfmeas"; srcs=@(
        "fpga\verification\sim\sim_stubs.v",
        "fpga\src\kvc_top_demo.v",
        "fpga\src\processing\kvc_blob_detect.v",
        "fpga\src\processing\vsync_monitor.v",
        "fpga\src\processing\vsync_report.v",
        "fpga\src\comm\uart_tx.v",
        "fpga\src\comm\bbox_packetizer.v",
        "fpga\src\comm\crc16_ccitt.v",
        "fpga\src\comm\data_ready_ctrl.v",
        "fpga\src\comm\mock_bbox.v",
        "fpga\src\camera\camera_rx.v",
        "fpga\src\camera\ov2640_config.v",
        "fpga\src\camera\sccb_master.v",
        "fpga\src\gowin_rpll\Gowin_rPLL_100M.v",
        "fpga\src\gowin_rpll\Gowin_rPLL_24M.v"
    ) },
    @{ name="tb_kvc_blob_detect"; srcs=@(
        "fpga\src\processing\kvc_blob_detect.v"
    ) },
    @{ name="tb_kvc_top_blob"; srcs=@(
        "fpga\verification\sim\sim_stubs.v",
        "fpga\src\kvc_top_demo.v",
        "fpga\src\processing\kvc_blob_detect.v",
        "fpga\src\comm\uart_tx.v",
        "fpga\src\comm\bbox_packetizer.v",
        "fpga\src\comm\crc16_ccitt.v",
        "fpga\src\comm\data_ready_ctrl.v",
        "fpga\src\comm\mock_bbox.v",
        "fpga\src\camera\camera_rx.v",
        "fpga\src\camera\ov2640_config.v",
        "fpga\src\camera\sccb_master.v",
        "fpga\src\gowin_rpll\Gowin_rPLL_100M.v",
        "fpga\src\gowin_rpll\Gowin_rPLL_24M.v"
    ) }
)

$results = @()

Write-Host ""
Write-Host "================================================================"
Write-Host "  KVC FPGA TESTBENCH SUITE"
Write-Host "================================================================"
Write-Host "  iverilog : $Iverilog"
Write-Host "  tmp dir  : $tmpDir"
Write-Host ""

foreach ($t in $tests) {
    if ($Filter.Count -gt 0 -and (-not ($Filter -contains $t.name))) {
        continue
    }
    $tbFile = Join-Path $tbDir ($t.name + ".v")
    $vvpOut = Join-Path $tmpDir ($t.name + ".vvp")

    if (-not (Test-Path -LiteralPath $tbFile)) {
        Write-Host ("  {0,-24} SKIP      (khong tim thay {1})" -f $t.name, $tbFile)
        $results += [pscustomobject]@{ Test=$t.name; Result="SKIP"; Exit=$null; Summary="" }
        continue
    }

    $srcPaths = @($tbFile)
    foreach ($s in $t.srcs) { $srcPaths += (Join-Path $repoRoot $s) }

    $compileLog = & $Iverilog -g2012 -o $vvpOut -s $t.name @srcPaths 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host ("  {0,-24} FAIL      (compile, exit {1})" -f $t.name, $LASTEXITCODE)
        $compileLog | Select-Object -First 5 | ForEach-Object { Write-Host ("      " + $_) }
        $results += [pscustomobject]@{ Test=$t.name; Result="FAIL"; Exit=$LASTEXITCODE; Summary="compile error" }
        continue
    }

    # Chay trong repoRoot de duong dan golden tuong doi hoat dong
    Push-Location $repoRoot
    try {
        $runLog = & $Vvp $vvpOut 2>&1
        $runExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    $summary = ($runLog | Select-String "SUMMARY" | ForEach-Object { $_.Line.Trim() }) -join " | "
    if ([string]::IsNullOrEmpty($summary)) {
        $summary = ($runLog | Select-String "PASS:" | ForEach-Object { $_.Line.Trim() }) -join " | "
    }

    if ($runExit -eq 0) {
        Write-Host ("  {0,-24} PASS      exit 0   {1}" -f $t.name, $summary)
        $results += [pscustomobject]@{ Test=$t.name; Result="PASS"; Exit=0; Summary=$summary }
    } else {
        Write-Host ("  {0,-24} FAIL      exit {1}   {2}" -f $t.name, $runExit, $summary)
        $runLog | Select-String "FAIL" | Select-Object -First 3 | ForEach-Object { Write-Host ("      " + $_.Line.Trim()) }
        $results += [pscustomobject]@{ Test=$t.name; Result="FAIL"; Exit=$runExit; Summary=$summary }
    }
}

Write-Host ""
Write-Host "================================================================"
Write-Host "  TONG KET"
Write-Host "================================================================"
foreach ($r in $results) {
    $e = if ($null -eq $r.Exit) { "-" } else { $r.Exit }
    Write-Host ("  {0,-24} {1,-9} exit {2}" -f $r.Test, $r.Result, $e)
}

$nPass = @($results | Where-Object { $_.Result -eq "PASS" }).Count
$nFail = @($results | Where-Object { $_.Result -eq "FAIL" }).Count
$nSkip = @($results | Where-Object { $_.Result -eq "SKIP" }).Count

Write-Host "================================================================"
Write-Host ("KET QUA: {0} PASS, {1} FAIL, {2} SKIP" -f $nPass, $nFail, $nSkip)
Write-Host "================================================================"

Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

if ($nFail -gt 0) { exit 1 }
exit 0
