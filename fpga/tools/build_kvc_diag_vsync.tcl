# KVC — Build bitstream CHAN DOAN TU DO VSYNC (KVC-CAM-DIAG-20261102)
#
# Cach dung (tu thu muc fpga):
#     gw_sh tools/build_kvc_diag_vsync.tcl
#
# Cach khac (PowerShell, tu thu muc fpga):
#     & "C:\Gowin\Gowin_V1.9.11.03_Education_x64\IDE\bin\gw_sh.exe" tools/build_kvc_diag_vsync.tcl
#
# TAI SAO CO SCRIPT NAY
#   `DIAG_MODE` la parameter cua `kvc_top_demo`, mac dinh 0. TCL cua Gowin
#   khong co cach override parameter cua top tin cay, nen bitstream diag
#   `3620B802` truoc day duoc tao bang cach SUA TAM gia tri mac dinh trong
#   `kvc_top_demo.v`. Cach do de repo o trang thai khong tai lap duoc neu
#   quen khoi phuc.
#
#   Nay dung `src/kvc_top_diag_vsync.v` lam wrapper cam cung DIAG_MODE = 2.
#   Script nay:
#     1. Copy project ra `impl_diag_vsync/` (KHONG dung `impl/`)
#     2. Doi top module sang `kvc_top_diag_vsync`
#     3. Chay synthesis + PnR + xuat .fs
#   `KVC_FPGA.gprj` va `impl/` khong bi dong vao.
#
# SAU KHI BUILD
#   - Ghi SHA-256, Fmax, tai nguyen vao docs/verification/FPGA_BUILD_RECORD.md
#   - Nap bang `programmer` qua SRAM Program (mat dien la ve bitstream cu)
#   - Chay: python scripts/manual/fpga_uart_capture.py --port COMx --seconds 30 --dump ...

set prj_in  "KVC_FPGA.gprj"
set workdir "impl_diag_vsync"
set prj     "$workdir/KVC_FPGA_diag.gprj"

if {![file exists $prj_in]} {
    puts "ERROR: khong tim thay $prj_in (phai chay tu thu muc fpga)"
    exit 1
}

file mkdir $workdir

# Doc project goc, doi top module + them wrapper, ghi ra ban sao.
set fh [open $prj_in r]
set body [read $fh]
close $fh

# Them wrapper ngay sau dong kvc_top_demo de thu tu bien dich on dinh.
set anchor {<File path="src/kvc_top_demo.v" type="file.verilog" enable="1"/>}
if {[string first $anchor $body] < 0} {
    puts "ERROR: khong tim thay kvc_top_demo.v trong $prj_in"
    exit 1
}
set body [string map [list $anchor "$anchor\n        <File path=\"src/kvc_top_diag_vsync.v\" type=\"file.verilog\" enable=\"1\"/>"] $body]

# Wrapper dat kvc_top_demo lam `u_top`, nen SDC cua release tro
# `u_pll100/rpll_inst/CLKOUT` se khong tim thay -> TA2004 va dung build.
# Doi sang SDC rieng co duong dan `u_top/u_pll100/...`.
set body [string map [list {<File path="constraints/kvc_top_demo.sdc" type="file.sdc" enable="1"/>} {<File path="constraints/kvc_cam_pclk.sdc" type="file.sdc" enable="1"/>}] $body]

# GowinSynthesis resolve `path="..."` theo thu muc cua file .gprj, khong theo
# thu muc CWD. Vi ban sao nam trong $workdir (khac fpga), phai doi MOI duong
# dan thanh tuyet doi truoc khi ghi.
set cwd [pwd]
set out ""
foreach line [split $body "\n"] {
    if {[regexp {path="([^"]+)"} $line -> p]} {
        if {![string match "/*" $p] && ![string match "*:*" $p]} {
            set line [string map [list "path=\"$p\"" "path=\"$cwd/$p\""] $line]
        }
    }
    append out $line "\n"
}

set fh [open $prj w]
puts -nonewline $fh $out
close $fh

open_project $prj

# Top module cua wrapper; cac IO trung ten voi kvc_top_demo nen dung lai
# nguyen KVC_FPGA.cst, khong can file constraint rieng.
set_option -top_module kvc_top_diag_vsync

# `spi_cs/sclk/mosi/miso` nam tren chan SPI chuyen dung (SSPI/MSPI) cua
# GW2A-18C. Che do blob khong dung SPI nen PnR coi cac rang buoc do la "useless"
# va bao PR2028/PR2017. Bitstream release cung co tinh trang nay; build goc
# chay duoc vi `Promote_Physical_Constraint_Warning_to_Error` xu ly khac nhau
# giua GUI va CLI. Tat promote de CLI khop voi GUI, KHONG bo rang buoc chan —
# pinout van giu nguyen cho tuong lai bat CNN duong SPI.
set_option -cst_warn_to_error 0

puts "=== SYNTHESIS + PnR (top = kvc_top_diag_vsync, DIAG_MODE = 2) ==="
run all

puts "=== BUILD DONE ==="
puts "Bitstream: $workdir/impl/pnr/KVC_FPGA_diag.fs"
puts "Report   : $workdir/impl/pnr/KVC_FPGA_diag.rpt.txt"
exit 0
