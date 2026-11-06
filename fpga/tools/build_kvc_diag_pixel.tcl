# KVC — Build bitstream CHAN DOAN THONG KE MAU RGB565 (KVC-CAM-DIAG-20261103)
#
# Muc dich: phuc vu muc G6.1.9 — do GIA TRI MAU that (R/G/B) de biet nguong
# trong `kvc_blob_detect` co dung khong. Day la phep do khac 6.1.10.
#
# Cach dung (tu thu muc fpga):
#     gw_sh tools/build_kvc_diag_pixel.tcl
#
# Cach khac (PowerShell, tu thu muc fpga):
#     & "C:\Gowin\Gowin_V1.9.11.03_Education_x64\IDE\bin\gw_sh.exe" tools/build_kvc_diag_pixel.tcl
#
# TAI SAO CO SCRIPT NAY
#   `DIAG_MODE` la parameter cua `kvc_top_demo`, mac dinh 0. TCL Gowin khong co
#   cach override parameter cua top tin cay. Dung wrapper
#   `src/kvc_top_diag_pixel.v` cam cung DIAG_MODE = 3, khong sua file nguon nao.
#   Script nay:
#     1. Copy project ra `impl_diag_pixel/` (KHONG dung `impl/`)
#     2. Doi top module sang `kvc_top_diag_pixel`
#     3. Chay synthesis + PnR + xuat .fs
#   `KVC_FPGA.gprj` va `impl/` khong bi dong vao.
#
# SAU KHI BUILD
#   1. Ghi SHA-256, Fmax, tai nguyen vao docs/verification/FPGA_BUILD_RECORD.md
#   2. Nap bang Programmer qua SRAM Program (mat dien la ve bitstream cu)
#   3. Doi tuong cam/do Dac phu kin khung hinh (KHONG dung man hinh phat)
#   4. Capture:  python scripts/manual/fpga_uart_capture.py --port COMx --seconds 10 --dump ...
#   5. Giai ma:  python scripts/manual/decode_pixel_diag.py --file <capture.bin>
#   6. Xong thi NAP LAI `86CCF5DD` truoc khi lam bat ky viec gi khac.

set prj_in  "KVC_FPGA.gprj"
set workdir "impl_diag_pixel"
set prj     "$workdir/KVC_FPGA_diag_pixel.gprj"

if {![file exists $prj_in]} {
    puts "ERROR: khong tim thay $prj_in (phai chay tu thu muc fpga)"
    exit 1
}

file mkdir $workdir

# Doc project goc, doi top module + them wrapper + them pixel_stats, ghi ra ban sao.
set fh [open $prj_in r]
set body [read $fh]
close $fh

# Them wrapper ngay sau kvc_top_demo de thu tu bien dich on dinh.
set anchor {<File path="src/kvc_top_demo.v" type="file.verilog" enable="1"/>}
if {[string first $anchor $body] < 0} {
    puts "ERROR: khong tim thay kvc_top_demo.v trong $prj_in"
    exit 1
}
set body [string map [list $anchor "$anchor\n        <File path=\"src/kvc_top_diag_pixel.v\" type=\"file.verilog\" enable=\"1\"/>"] $body]

# `pixel_stats` phai co trong project. Chen canh blob_detect de nhom processing
# nam cung cho, de doc.
set proc_anchor {<File path="src/processing/kvc_blob_detect.v" type="file.verilog" enable="1"/>}
if {[string first $proc_anchor $body] < 0} {
    puts "WARN: khong tim thay kvc_blob_detect.v — them pixel_stats sau kvc_top_demo"
    set body [string map [list $anchor "$anchor\n        <File path=\"src/processing/pixel_stats.v\" type=\"file.verilog\" enable=\"1\"/>"] $body]
} else {
    set body [string map [list $proc_anchor "$proc_anchor\n        <File path=\"src/processing/pixel_stats.v\" type=\"file.verilog\" enable=\"1\"/>"] $body]
}

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
set_option -top_module kvc_top_diag_pixel

# `spi_cs/sclk/mosi/miso` nam tren chan SPI chuyen dung (SSPI/MSPI) cua
# GW2A-18C. Che do blob khong dung SPI nen PnR coi cac rang buoc do la "useless"
# va bao PR2028/PR2017. Bitstream release cung co tinh trang nay; build goc
# chay duoc vi `Promote_Physical_Constraint_Warning_to_Error` xu ly khac nhau
# giua GUI va CLI. Tat promote de CLI khop voi GUI, KHONG bo rang buoc chan.
set_option -cst_warn_to_error 0

puts "=== SYNTHESIS + PnR (top = kvc_top_diag_pixel, DIAG_MODE = 3) ==="
run all

puts "=== BUILD DONE ==="
puts "Bitstream: $workdir/impl/pnr/KVC_FPGA_diag_pixel.fs"
puts "Report   : $workdir/impl/pnr/KVC_FPGA_diag_pixel.rpt.txt"
exit 0
