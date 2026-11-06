#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build_rtl
iverilog -g2012 -s tb_conv_engine_dynamic -o build_rtl/tb_conv_engine_dynamic.vvp rtl/gen/conv_engine_dynamic.v tb/tb_conv_engine_dynamic.v
vvp build_rtl/tb_conv_engine_dynamic.vvp
iverilog -g2012 -s tb_image_letterbox_sync -o build_rtl/tb_image_letterbox_sync.vvp src/image_letterbox.v tb/tb_image_letterbox_sync.v
vvp build_rtl/tb_image_letterbox_sync.vvp
