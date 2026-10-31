# Run from KVC_FPGA project root after the smoke test passes.
# This is a full, serial golden test and may take a long time.
if {[file exists work]} {vdel -lib work -all}
vlib work
vlog -sv src/processing/conv_engine.v
vlog -sv verification/tb/tb_conv_engine_conv0_full.v
vsim -voptargs=+acc work.tb_conv_engine_conv0_full
run -all
