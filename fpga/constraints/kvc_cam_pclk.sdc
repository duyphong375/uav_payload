// KVC_CAM_PCLK: SDC cua bitstream DIAG_MODE=2 (wrapper kvc_top_diag_vsync).
//
// KHAC BIET SO VOI constraints/kvc_top_demo.sdc
//   Chi mot dong: duong dan toi PLL co them cap `u_top/`, vi wrapper dat
//   kvc_top_demo lam instance ten `u_top`. Moi tham so timing (37,037 ns /
//   10,000 ns / 41,666 ns), clock group va false path giu NGUYEN.
//
//   Khong dung lai file goc duoc vi `get_pins {u_pll100/...}` se khong tim
//   thay trong wrapper -> Gowin bao TA2004 "Cannot get clock with name
//   'clk_100m'" va dung build.
//
// MUC DICH bitstream nay la DO nhip VSYNC (KVC-CAM-DIAG-20261102), khong phai
// release. Bitstream release van dung constraints/kvc_top_demo.sdc va top
// `kvc_top_demo` khong co wrapper.

create_clock -name clk_27m -period 37.037 [get_ports {clk_27m}]
create_clock -name clk_100m -period 10.000 [get_pins {u_top/u_pll100/rpll_inst/CLKOUT}]
create_clock -name cam_pclk -period 41.666 [get_ports {cam_pclk}]

set_clock_groups -asynchronous -group [get_clocks {clk_27m}]
set_clock_groups -asynchronous -group [get_clocks {clk_100m}] -group [get_clocks {cam_pclk}]

set_false_path -from [get_clocks {cam_pclk}] -to [get_clocks {clk_100m}]
