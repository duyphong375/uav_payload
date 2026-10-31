`timescale 1ns/1ps

module kvc_top_demo
(
    input  wire clk_27m,
    input  wire rst_n,

    // Camera OV2640 DVP Interface
    input  wire        cam_pclk,
    input  wire        cam_vsync,
    input  wire        cam_href,
    input  wire [7:0]  cam_data,
    output wire        cam_xclk,

    inout  wire        ov2640_sda,
    output wire        ov2640_scl,

    // SPI Flash
    output wire spi_cs,
    output wire spi_sclk,
    output wire spi_mosi,
    input  wire spi_miso,

    // UART & Handshake sang MCU Sonix (ABI IF-02)
    output wire uart_tx,
    output wire data_ready,
    input  wire mcu_ack,

    // LED trang thai tren bo (Active-LOW)
    output wire led_camera_ok,
    output wire led_cnn_done,
    output wire led_uart_busy
);

    localparam integer KERNEL = 3;
    localparam integer IN_C   = 3;
    localparam integer Q_BITS = 8;

    wire clk_100m;
    wire pll_lock;

    Gowin_rPLL_100M u_pll100 (
        .clkout (clk_100m),
        .lock   (pll_lock),
        .clkin  (clk_27m)
    );

    // Cung cap XCLK 24MHz cho module Camera OV2640
    wire clk_24m;
    Gowin_rPLL_24M u_pll24 (
        .clkout (clk_24m),
        .lock   (),
        .clkin  (clk_27m)
    );
    assign cam_xclk = clk_24m;

    // Khoi tao va cau hinh Camera OV2640 qua SCCB/I2C (VGA 640x480 RGB565)
    wire sccb_start;
    wire [7:0] sccb_reg_addr;
    wire [7:0] sccb_reg_data;
    wire sccb_busy;
    wire sccb_done;
    wire cfg_done;

    ov2640_config #(.CLK_FREQ_HZ(100_000_000)) u_ov2640_cfg (
        .clk           (clk_100m),
        .rst_n         (rst_n),
        .start         (pll_lock),
        .busy          (),
        .done          (cfg_done),
        .sccb_start    (sccb_start),
        .sccb_reg_addr (sccb_reg_addr),
        .sccb_reg_data (sccb_reg_data),
        .sccb_busy     (sccb_busy),
        .sccb_done     (sccb_done)
    );

    sccb_master #(
        .SCL_DIV    (250),
        .DEV_ADDR   (8'h60),
        .ADDR_BYTES (1)
    ) u_sccb (
        .clk        (clk_100m),
        .rst_n      (rst_n),
        .start      (sccb_start),
        .reg_addr   ({8'h00, sccb_reg_addr}),
        .reg_data   (sccb_reg_data),
        .scl        (ov2640_scl),
        .sda        (ov2640_sda),
        .busy       (sccb_busy),
        .done       (sccb_done)
    );

    // --- Camera Receiver (8-bit DVP to 16-bit RGB565) ---
    wire [15:0] cap_pixel_data;
    wire        cap_pixel_valid;
    wire        cap_frame_valid;

    camera_rx #(.SKIP_FRAMES(2)) u_cam_rx (
        .pclk        (cam_pclk),
        .rst_n       (rst_n),
        .vsync       (cam_vsync),
        .href        (cam_href),
        .data_in     (cam_data),
        .pixel_data  (cap_pixel_data),
        .pixel_valid (cap_pixel_valid),
        .frame_start (),
        .frame_valid (cap_frame_valid)
    );

    // Dong bo xung VSYNC sang domain 100MHz (1-cycle pulse)
    reg [2:0] cam_vsync_sync;
    always @(posedge clk_100m or negedge rst_n) begin
        if (!rst_n) cam_vsync_sync <= 3'b000;
        else        cam_vsync_sync <= {cam_vsync_sync[1:0], cam_vsync};
    end
    wire cam_vsync_pulse = cam_vsync_sync[1] & ~cam_vsync_sync[2];

    wire [15:0] fifo_rd_data;
    wire        fifo_empty, fifo_full, fifo_overflow, fifo_underflow;
    wire        fifo_rd_en = ~fifo_empty;

    async_fifo_cdc #(.DEPTH_BITS(8), .DATA_WIDTH(16)) u_cdc_fifo (
        .wr_clk    (cam_pclk),
        .rd_clk    (clk_100m),
        .rst_n     (rst_n),
        .wr_en     (cap_pixel_valid),
        .wr_data   (cap_pixel_data),
        .full      (fifo_full),
        .overflow  (fifo_overflow),
        .rd_en     (fifo_rd_en),
        .rd_data   (fifo_rd_data),
        .empty     (fifo_empty),
        .underflow (fifo_underflow)
    );

    wire [7:0]  letterbox_out_data;
    wire [16:0] letterbox_out_addr;
    wire        letterbox_out_we;
    wire        letterbox_out_done;

    image_letterbox #(.IN_W(640), .IN_H(480), .OUT_W(160), .OUT_H(160), .PAD_COLOR(8'd114)) u_letterbox (
        .clk            (clk_100m),
        .rst_n          (rst_n),
        .in_pixel       (fifo_rd_data),
        .in_valid       (fifo_rd_en),
        .frame_start    (cam_vsync_pulse),
        .out_data       (letterbox_out_data),
        .out_addr       (letterbox_out_addr),
        .out_we         (letterbox_out_we),
        .out_frame_done (letterbox_out_done)
    );

    // --- Line Buffer ---
    wire [(KERNEL*KERNEL*IN_C*Q_BITS)-1:0] conv_win_data;
    wire conv_win_valid = letterbox_out_we;
    wire [7:0] lb_00, lb_01, lb_02, lb_10, lb_11, lb_12, lb_20, lb_21, lb_22;

    line_buffer_3x3 #(.MAX_W(640), .DATA_W(8), .ADDR_W(10)) u_line_buffer (
        .clk     (clk_100m),
        .rst_n   (rst_n),
        .wr_en   (letterbox_out_we),
        .wr_x    (letterbox_out_addr[9:0]),
        .wr_data (letterbox_out_data),
        .rd_x    (10'd10),
        .rd_y    (10'd10),
        .win_00  (lb_00), .win_01  (lb_01), .win_02  (lb_02),
        .win_10  (lb_10), .win_11  (lb_11), .win_12  (lb_12),
        .win_20  (lb_20), .win_21  (lb_21), .win_22  (lb_22)
    );

    assign conv_win_data = {
        lb_22, lb_21, lb_20, lb_12, lb_11, lb_10, lb_02, lb_01, lb_00,
        8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0,
        8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0
    };

    // --- SPI & Conv Engine ---
    wire [23:0] spi_weight_addr;
    wire        spi_weight_req;
    wire [31:0] spi_weight_rdata;
    wire        spi_weight_rvalid;

    spi_flash_wrapper u_spi_wrap (
        .clk      (clk_100m),
        .rst_n    (rst_n),
        .req      (spi_weight_req),
        .addr     (spi_weight_addr),
        .rdata    (spi_weight_rdata),
        .rvalid   (spi_weight_rvalid),
        .spi_cs   (spi_cs),
        .spi_sclk (spi_sclk),
        .spi_mosi (spi_mosi),
        .spi_miso (spi_miso)
    );

    wire [15:0] bias_addr, mult_addr;
    wire [31:0] bias_rdata, mult_rdata;
    wire        bias_rvalid, mult_rvalid, bias_req, mult_req;

    bias_mem #(.DEPTH(256), .DATA_W(32)) u_bias_mem (
        .clk(clk_100m), .rst_n(rst_n), .req(bias_req), .addr(bias_addr), .rdata(bias_rdata), .rvalid(bias_rvalid)
    );
    mult_mem #(.DEPTH(256), .DATA_W(32)) u_mult_mem (
        .clk(clk_100m), .rst_n(rst_n), .req(mult_req), .addr(mult_addr), .rdata(mult_rdata), .rvalid(mult_rvalid)
    );

    wire [15:0] conv_out_x, conv_out_y, conv_out_c;
    wire [7:0]  conv_out_q;
    wire [16:0] conv_out_addr;
    wire        conv_out_valid, conv_done;

    conv_engine_dynamic_fsm #(
        .KERNEL(KERNEL), .IN_C(IN_C), .OUT_C(32), .IMG_W(160), .IMG_H(160), .Q_BITS(Q_BITS)
    ) u_conv (
        .clk(clk_100m), .rst_n(rst_n), .start(letterbox_out_done),
        .p_stride(16'd2), .p_pad(16'd1), .p_weight_base(24'h400000), .p_bias_base(24'd0), .p_quant_base(24'd0),
        .win_valid(conv_win_valid), .win_ready(), .win_data(conv_win_data),
        .bias_addr(bias_addr), .bias_rdata(bias_rdata), .bias_rvalid(bias_rvalid), .bias_req(bias_req),
        .mult_addr(mult_addr), .mult_rdata(mult_rdata), .mult_rvalid(mult_rvalid), .mult_req(mult_req),
        .weight_addr(spi_weight_addr), .weight_rdata(spi_weight_rdata), .weight_rvalid(spi_weight_rvalid), .weight_req(spi_weight_req),
        .out_valid(conv_out_valid), .out_x(conv_out_x), .out_y(conv_out_y), .out_c(conv_out_c), .out_q(conv_out_q), .out_addr(conv_out_addr),
        .busy(), .done(conv_done)
    );

    // --- NMS (Non-Maximum Suppression) ---
    wire        nms_out_valid, nms_out_last;
    wire [15:0] nms_out_x, nms_out_y, nms_out_w, nms_out_h, nms_out_conf;
    wire [7:0]  nms_out_class;

    yolo_nms #(.MAX_BOXES(16), .BOX_W(16), .BOX_H(16), .CONF_W(16), .CLASS_W(8)) u_nms (
        .clk       (clk_100m),
        .rst_n     (rst_n),
        .in_valid  (conv_out_valid),
        .in_last   (conv_done),
        .in_x      (conv_out_x),
        .in_y      (conv_out_y),
        .in_w      (conv_out_x),
        .in_h      (conv_out_y),
        .in_conf   ({8'd0, conv_out_q}),
        .in_class  (conv_out_c[7:0]),
        .out_valid (nms_out_valid),
        .out_last  (nms_out_last),
        .out_x     (nms_out_x),
        .out_y     (nms_out_y),
        .out_w     (nms_out_w),
        .out_h     (nms_out_h),
        .out_conf  (nms_out_conf),
        .out_class (nms_out_class)
    );

    // --- IF-02 BBox Packetizer & UART TX (Baud 38400) ---
    wire [63:0] nms_bbox_data = {
        nms_out_x,
        nms_out_y,
        nms_out_w[7:0],
        nms_out_h[7:0],
        nms_out_class,
        nms_out_conf[7:0]
    };

    wire [7:0] pack_uart_tx_data;
    wire       pack_uart_tx_start;
    wire       pack_packet_done;
    wire       uart_tx_busy_sig;

    // Timestamp 32-bit (100MHz ticks)
    reg [31:0] frame_timestamp;
    always @(posedge clk_100m or negedge rst_n) begin
        if (!rst_n) frame_timestamp <= 32'd0;
        else        frame_timestamp <= frame_timestamp + 32'd1;
    end

    // Frame bbox counter
    reg [7:0] nms_box_count;
    always @(posedge clk_100m or negedge rst_n) begin
        if (!rst_n) begin
            nms_box_count <= 8'd0;
        end else if (nms_out_valid) begin
            nms_box_count <= nms_box_count + 8'd1;
        end else if (pack_packet_done) begin
            nms_box_count <= 8'd0;
        end
    end

    bbox_packetizer #(
        .MAX_BBOX(16),
        .VERSION(8'h01)
    ) u_bbox_pkt (
        .clk           (clk_100m),
        .rst_n         (rst_n),
        .bbox_data     (nms_bbox_data),
        .bbox_valid    (nms_out_valid),
        .bbox_count    (nms_box_count),
        .timestamp     (frame_timestamp),
        .start         (nms_out_last),
        .force_bad_crc (1'b0),
        .uart_tx_busy  (uart_tx_busy_sig),
        .uart_tx_data  (pack_uart_tx_data),
        .uart_tx_start (pack_uart_tx_start),
        .packet_done   (pack_packet_done)
    );

    uart_tx #(
        .CLK_FREQ_HZ(100_000_000),
        .BAUD_RATE(38400)
    ) u_uart_tx (
        .clk      (clk_100m),
        .rst_n    (rst_n),
        .tx_data  (pack_uart_tx_data),
        .tx_valid (1'b0),
        .tx_start (pack_uart_tx_start),
        .tx_ready (),
        .tx_pin   (uart_tx),
        .tx       (),
        .tx_busy  (uart_tx_busy_sig),
        .tx_done  ()
    );

    // --- DATA_READY Controller (MCU Sonix handshaking) ---
    wire timeout_flag;

    data_ready_ctrl #(
        .CLK_FREQ_HZ(100_000_000),
        .SIM(0)
    ) u_dr_ctrl (
        .clk           (clk_100m),
        .rst_n         (rst_n),
        .frame_valid   (nms_out_last),
        .packet_done   (pack_packet_done),
        .mcu_ack       (mcu_ack),
        .clear_timeout (1'b0),
        .timeout_ms    (16'd100),
        .data_ready    (data_ready),
        .timeout_flag  (timeout_flag)
    );

    assign led_camera_ok = cfg_done & cap_frame_valid;
    assign led_cnn_done  = conv_done;
    assign led_uart_busy = data_ready | uart_tx_busy_sig;

endmodule
