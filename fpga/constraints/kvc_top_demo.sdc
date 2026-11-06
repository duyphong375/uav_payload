create_clock -name clk_27m -period 37.037 [get_ports {clk_27m}]
create_clock -name clk_100m -period 10.000 [get_pins {u_pll100/rpll_inst/CLKOUT}]
create_clock -name cam_pclk -period 41.666 [get_ports {cam_pclk}]

# Chỉ thiết lập bất đồng bộ giữa các clock hợp lệ
set_clock_groups -asynchronous -group [get_clocks {clk_27m}]
set_clock_groups -asynchronous -group [get_clocks {clk_100m}] -group [get_clocks {cam_pclk}]

# KVC-FPGA-BLOB-20261101-001: CDC của kvc_blob_detect là 1 bit toggle từ
# cam_pclk sang clk_100m. set_clock_groups ở trên đã khai báo hai clock bất
# đồng bộ nên đường này đã được miễn phân tích; false_path thêm dưới đây là
# khai báo tường minh theo kế hoạch §6.2. Một chiều (cam_pclk -> clk_100m) là
# đủ vì toggle sinh ra trong cam_pclk; chiều ngược lại không tồn tại.
set_false_path -from [get_clocks {cam_pclk}] -to [get_clocks {clk_100m}]

# Sửa lỗi TA2003: Bỏ hoàn toàn việc constrain vào get_pins nội bộ của SPI. 
# Nếu Gowin vẫn warning, nó sẽ tự động false path nội bộ trong IP.