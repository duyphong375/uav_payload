transcript on
if {![file exists work]} { vlib work }
vlog -sv src/processing/conv_engine.v
vlog -sv verification/tb/tb_conv_engine_smoke.v
vsim -voptargs=+acc work.tb_conv_engine_smoke
run -all
