// -----------------------------------------------------------------------------
// Module: kvc_top_diag_vsync.v
// Author: KVC Team (Kilo)
// Date:   2026-11-02
// Desc:   Wrapper build bitstream CHAN DOAN TU DO VSYNC.
//
// TAI SAO CAN WRAPPER
//   `DIAG_MODE` la `parameter` cua `kvc_top_demo` va mac dinh la 0. Gowin
//   Synthesis lay gia tri mac dinh trong RTL, va TCL cli khong co cach override
//   parameter tin cay (khac `-top_module`). Truoc day bitstream diag `3620B802`
//   duoc tao bang cach SUA TAM thoi gia tri mac dinh trong `kvc_top_demo.v` —
//   cach do de lai repo o trang thai khong tai lap duoc neu quen khoi phuc.
//
//   Wrapper nay cam thang `DIAG_MODE = 2` va KHONG sua file nguon nao. Chi can
//   doi `-top_module` khi build.
//
// KHONG ANH HUONG BITSTREAM RELEASE
//   File nay chi duoc them vao project khi build diag. Bitstream release van
//   dung `kvc_top_demo` truc tiep voi `DIAG_MODE = 0`.
//
// CHE DO NAY LAM GI
//   - `vsync_monitor` do chu ky VSYNC bang clock noi 100 MHz (thay scope)
//   - `vsync_report` day ket qua ra UART qua 10 bbox IF-01
//   - Blob van chay de `frame_pulse` dem dung so frame nguon da phat
//   - F-04 (timestamp latch) da sua trong `bbox_packetizer`
//   Chi tiet anh xa: xem `src/processing/vsync_report.v` §ANH XA.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module kvc_top_diag_vsync
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

    // Gia tri mac dinh cua DIAG_TICK_HZ / DIAG_WINDOW_MS (100 us / 2.000 ms)
    // la gia tri dung tren phan cung. KHONG ha xuong — do la cau hinh do that.
    kvc_top_demo #(
        .BBOX_SOURCE    (1),      // blob that: can pixel de dem frame nguon
        .DIAG_MODE      (2),      // bao cao tu do VSYNC thay cho bbox
        .DIAG_TICK_HZ   (10_000), // 100 us
        .DIAG_WINDOW_MS (2_000)   // cua so 2 s
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
