# ModelSim/Questa smoke test for generic conv_engine
# Run from the KVC_FPGA project root: do verification/tb/run_conv_engine_smoke.do
if {[file exists work]} {vdel -lib work -all}
vlib work
vlog -sv src/processing/conv_engine.v
vlog -sv verification/tb/tb_conv_engine_smoke.v
vsim -voptargs=+acc work.tb_conv_engine_smoke
run -all
quit -f
