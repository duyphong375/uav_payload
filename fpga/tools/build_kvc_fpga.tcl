# KVC — Rebuild bitstream tu HEAD bang Gowin gw_sh (batch, khong GUI).
#
# Cach dung (tu thu muc fpga):
#   gw_sh tools/build_kvc_fpga.tcl
#
# Script nay chi chay lai dung flow cua KVC_FPGA.gprj: Synthesis -> PnR -> .fs.
# Khong doi device, khong doi constraint, khong doi top module.

set prj_file "KVC_FPGA.gprj"

if {![file exists $prj_file]} {
    puts "ERROR: khong tim thay $prj_file (phai chay tu thu muc fpga)"
    exit 1
}

open_project $prj_file

puts "=== SYNTHESIS ==="
run all

puts "=== BUILD DONE ==="
exit 0
