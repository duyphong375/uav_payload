// -----------------------------------------------------------------------------
// Module: kvc_top_diag_pixel.v
// Author: KVC Team (Kilo)
// Date:   2026-11-03
// Desc:   Wrapper build bitstream CHAN DOAN THONG KE MAU RGB565 (muc G6.1.9).
//
// TAI SAO CAN WRAPPER
//   `DIAG_MODE` la `parameter` cua `kvc_top_demo`, mac dinh 0. Gowin Synthesis
//   lay gia tri mac dinh trong RTL, TCL cli khong co cach override parameter
//   tin cay. Wrapper nay cam thang `DIAG_MODE = 3` va KHONG sua file nguon nao.
//   Cung ly do va cung cach voi `kvc_top_diag_vsync.v`.
//
// KHONG ANH HUONG BITSTREAM RELEASE
//   File nay chi duoc them vao project khi build diag. Bitstream release van
//   dung `kvc_top_demo` truc tiep voi `DIAG_MODE = 0`.
//
// CHE DO NAY LAM GI
//   - `pixel_stats` tich luy tong R/G/B tren TOAN frame (khong phai 12 pixel roi)
//   - Bao cao 12 slot qua khung IF-01 (rev 2): pix_count, sum_r, sum_g, sum_b,
//     cnt_match (dung nguong blob), (center_pixel, max_r5), roi den
//     cnt_r_ok / cnt_g_ok / cnt_b_ok / cnt_rg_ok de biet dieu kien nao loai
//     nhieu pixel nhat. Slot 10..11 = 0.
//   - Blob van chay de `frame_pulse` dem dung so frame nguon da phat
//   Chi tiet anh xa: xem `src/processing/pixel_stats.v`
//
// CACH DUNG
//   1. Build:  gw_sh tools/build_kvc_diag_pixel.tcl   (tu thu muc fpga)
//   2. Nap .fs qua SRAM Program
//   3. Capture: python scripts/manual/fpga_uart_capture.py --port COMx --seconds 10 --dump ...
//   4. Giai ma: python scripts/manual/decode_pixel_diag.py --file <capture.bin>
//   5. Doi tuong do: vat cam/do dac phu kin khung hinh (khong dung man hinh phat)
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module kvc_top_diag_pixel
(
    input  wire clk_27m,
    input  wire rst_n,

    input  wire        cam_pclk,
    input  wire        cam_vsync,
    input  wire        cam_href,
    input  wire [7:0]  cam_data,
    output wire        cam_xclk,

    inout  wire        ov2640_sda,
    output wire        ov2640_scl,

    output wire spi_cs,
    output wire spi_sclk,
    output wire spi_mosi,
    input  wire spi_miso,

    output wire uart_tx,
    output wire data_ready,
    input  wire mcu_ack,

    output wire led_camera_ok,
    output wire led_cnn_done,
    output wire led_uart_busy
);

    kvc_top_demo #(
        .BBOX_SOURCE    (1),      // blob that: can pixel de dem frame nguon
        .DIAG_MODE      (3)       // bao cao thong ke mau thay cho bbox
    ) u_top (
        .clk_27m      (clk_27m),
        .rst_n        (rst_n),
        .cam_pclk     (cam_pclk),
        .cam_vsync    (cam_vsync),
        .cam_href     (cam_href),
        .cam_data     (cam_data),
        .cam_xclk     (cam_xclk),
        .ov2640_sda   (ov2640_sda),
        .ov2640_scl   (ov2640_scl),
        .spi_cs       (spi_cs),
        .spi_sclk     (spi_sclk),
        .spi_mosi     (spi_mosi),
        .spi_miso     (spi_miso),
        .uart_tx      (uart_tx),
        .data_ready   (data_ready),
        .mcu_ack      (mcu_ack),
        .led_camera_ok(led_camera_ok),
        .led_cnn_done (led_cnn_done),
        .led_uart_busy(led_uart_busy)
    );

endmodule
