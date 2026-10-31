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
  - tb_async_fifo_cdc    : CDC FIFO
  - tb_yolo_nms          : NMS

.PARAMETER Iverilog
Duong dan iverilog. Mac dinh lay tu PATH.

.EXAMPLE
pwsh -File scripts/run_fpga_tb.ps1
#>
param(
    [string]$Iverilog = "iverilog",
    [string]$Vvp      = "vvp"
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent $PSScriptRoot
$tbDir    = Join-Path $repoRoot "KVC_PR\verification\tb"
$ktDir    = Join-Path $repoRoot "KVC_PR\src"
$tmpDir   = Join-Path $env:TEMP ("kvc_tb_" + [guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

# Dinh nghia: ten TB + danh sach file nguon (tuong doi tu repoRoot)
$tests = @(
    @{ name="tb_uart_tx";           srcs=@("KVC_PR\src\comm\uart_tx.v") },
    @{ name="tb_bbox_packetizer";   srcs=@("KVC_PR\src\comm\bbox_packetizer.v","KVC_PR\src\comm\crc16_ccitt.v") },
    @{ name="tb_conv0_golden";      srcs=@("KVC_PR\src\conv_engine_dynamic_fsm.v") },
    @{ name="tb_conv0_real";        srcs=@("KVC_PR\src\conv_engine_dynamic_fsm.v") },
    @{ name="tb_depthwise";         srcs=@("KVC_PR\src\conv_engine_dynamic_fsm.v") },
    @{ name="tb_maxpool2d";         srcs=@("KVC_PR\src\processing\maxpool2d.v") },
    @{ name="tb_concat_n_feature";  srcs=@("KVC_PR\src\processing\concat_n_feature.v") },
    @{ name="tb_split_channels";    srcs=@("KVC_PR\src\processing\split_channels.v") },
    @{ name="tb_upsample_nearest";  srcs=@("KVC_PR\src\processing\upsample_nearest.v") },
    @{ name="tb_residual_add_int8"; srcs=@("KVC_PR\src\processing\residual_add_int8.v") },
    @{ name="tb_sppf_block";        srcs=@("KVC_PR\src\processing\sppf_block.v","KVC_PR\src\processing\maxpool2d.v") },
    @{ name="tb_async_fifo_cdc";    srcs=@("KVC_PR\src\async_fifo_cdc.v") },
    @{ name="tb_yolo_nms";          srcs=@("KVC_PR\src\yolo_nms.v") },
    @{ name="tb_kvc_top_demo";      srcs=@(
        "KVC_PR\verification\sim\sim_stubs.v",
        "KVC_PR\src\kvc_top_demo.v",
        "KVC_PR\src\comm\uart_tx.v",
        "KVC_PR\src\comm\bbox_packetizer.v",
        "KVC_PR\src\comm\crc16_ccitt.v",
        "KVC_PR\src\comm\data_ready_ctrl.v",
        "KVC_PR\src\comm\mock_bbox.v",
        "KVC_PR\src\camera\camera_rx.v",
        "KVC_PR\src\camera\ov2640_config.v",
        "KVC_PR\src\camera\sccb_master.v",
        "KVC_PR\src\gowin_rpll\Gowin_rPLL_100M.v",
        "KVC_PR\src\gowin_rpll\Gowin_rPLL_24M.v"
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
